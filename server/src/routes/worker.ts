import { createHash, timingSafeEqual } from 'node:crypto';
import { rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { DOWNLOAD_MODE, MEDIA_DIR, WORKER_TOKEN } from '../config.js';
import { db, type ImportRow, type TrackRow } from '../db.js';
import { progress } from '../downloads.js';
import { getTrack, importInfo } from '../library.js';
import { trimInfo, type MediaInfo } from '../ytdlp.js';

/** Última vez que o worker falou com o servidor (ms). */
let lastSeen = 0;
const ONLINE_WINDOW_MS = 60_000;

const sha256 = (value: string) => createHash('sha256').update(value).digest();

type IdParams = { Params: { id: string } };

export async function workerRoutes(app: FastifyInstance) {
  /** Para o app: modo de download, se o PC está conectado e quanto está esperando. */
  app.get('/api/status', async () => {
    const waiting = db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM tracks WHERE status IN ('pending', 'downloading')) AS tracks,
           (SELECT COUNT(*) FROM imports WHERE status IN ('pending', 'processing')) AS imports`,
      )
      .get() as { tracks: number; imports: number };
    return {
      downloadMode: DOWNLOAD_MODE,
      worker: {
        online: Date.now() - lastSeen < ONLINE_WINDOW_MS,
        lastSeen: lastSeen ? new Date(lastSeen).toISOString() : null,
      },
      waiting,
    };
  });

  // Rotas do worker: autenticadas pelo WORKER_TOKEN, não pela sessão do navegador.
  await app.register(async (w) => {
    w.addHook('onRequest', async (req, reply) => {
      const header = req.headers.authorization ?? '';
      const token = header.startsWith('Bearer ') ? header.slice(7) : '';
      if (!WORKER_TOKEN || !timingSafeEqual(sha256(token), sha256(WORKER_TOKEN))) {
        return reply.code(401).send({ error: 'Token do worker inválido.' });
      }
      lastSeen = Date.now();
    });

    // Áudio e capa chegam como corpo binário.
    w.addContentTypeParser(
      ['audio/mp4', 'image/jpeg', 'application/octet-stream'],
      { parseAs: 'buffer', bodyLimit: 500 * 1024 * 1024 },
      (_req, body, done) => done(null, body),
    );

    /** Próxima tarefa: primeiro URLs a buscar, depois faixas a baixar. 204 = nada a fazer. */
    w.post('/api/worker/claim', async (_req, reply) => {
      // Um worker por vez, e ele faz uma tarefa de cada vez: se está pedindo outra, não tem
      // nenhuma em mãos. O que ficou "em andamento" (upload que falhou, PC desligado no meio,
      // worker reiniciado) volta para a fila na hora, em vez de esperar um tempo limite.
      db.exec("UPDATE imports SET status = 'pending', claimed_at = NULL WHERE status = 'processing'");
      db.exec("UPDATE tracks SET status = 'pending', claimed_at = NULL WHERE status = 'downloading'");
      progress.clear();

      const imp = db
        .prepare("SELECT * FROM imports WHERE status = 'pending' ORDER BY id LIMIT 1")
        .get() as ImportRow | undefined;
      if (imp) {
        db.prepare("UPDATE imports SET status = 'processing', claimed_at = datetime('now') WHERE id = ?").run(
          imp.id,
        );
        return { type: 'import', id: imp.id, url: imp.url };
      }

      const track = db
        .prepare("SELECT * FROM tracks WHERE status = 'pending' ORDER BY id LIMIT 1")
        .get() as TrackRow | undefined;
      if (track) {
        db.prepare(
          "UPDATE tracks SET status = 'downloading', error = NULL, claimed_at = datetime('now') WHERE id = ?",
        ).run(track.id);
        progress.set(track.id, 0);
        return { type: 'track', id: track.id, url: track.source_url };
      }

      return reply.code(204).send();
    });

    w.post<IdParams & { Body: { info?: MediaInfo } }>(
      '/api/worker/imports/:id/result',
      { bodyLimit: 20 * 1024 * 1024 },
      async (req, reply) => {
        const id = Number(req.params.id);
        const info = req.body?.info;
        if (!info?.id || !info.extractor_key) return reply.code(400).send({ error: 'info inválido.' });
        const result = importInfo(trimInfo(info));
        db.prepare('DELETE FROM imports WHERE id = ?').run(id);
        return result;
      },
    );

    w.post<IdParams & { Body: { message?: string } }>('/api/worker/imports/:id/error', async (req, reply) => {
      db.prepare("UPDATE imports SET status = 'error', error = ?, claimed_at = NULL WHERE id = ?").run(
        req.body?.message ?? 'Erro desconhecido no worker.',
        Number(req.params.id),
      );
      return reply.code(204).send();
    });

    w.post<IdParams & { Body: { percent?: number } }>(
      '/api/worker/tracks/:id/progress',
      async (req, reply) => {
        progress.set(Number(req.params.id), Number(req.body?.percent) || 0);
        return reply.code(204).send();
      },
    );

    w.put<IdParams & { Body: Buffer }>('/api/worker/tracks/:id/cover', async (req, reply) => {
      const track = getTrack(Number(req.params.id));
      if (!track) return reply.code(404).send({ error: 'Faixa não existe mais.' });
      const name = `track-${track.id}.jpg`;
      await writeAtomic(name, req.body);
      db.prepare('UPDATE tracks SET cover = ? WHERE id = ?').run(name, track.id);
      return reply.code(204).send();
    });

    /** Áudio recebido = faixa pronta. Enviar a capa antes, se houver. */
    w.put<IdParams & { Body: Buffer }>('/api/worker/tracks/:id/audio', async (req, reply) => {
      const track = getTrack(Number(req.params.id));
      if (!track) return reply.code(404).send({ error: 'Faixa não existe mais.' });
      if (!req.body?.length) return reply.code(400).send({ error: 'Áudio vazio.' });
      const name = `track-${track.id}.m4a`;
      await writeAtomic(name, req.body);
      db.prepare(
        "UPDATE tracks SET status = 'ready', file = ?, error = NULL, claimed_at = NULL WHERE id = ?",
      ).run(name, track.id);
      progress.delete(track.id);
      return reply.code(204).send();
    });

    w.post<IdParams & { Body: { message?: string } }>('/api/worker/tracks/:id/error', async (req, reply) => {
      const id = Number(req.params.id);
      db.prepare("UPDATE tracks SET status = 'error', error = ?, claimed_at = NULL WHERE id = ?").run(
        req.body?.message ?? 'Erro desconhecido no worker.',
        id,
      );
      progress.delete(id);
      return reply.code(204).send();
    });
  });
}

/** Grava num temporário e renomeia: quem estiver tocando nunca lê um arquivo pela metade. */
async function writeAtomic(name: string, data: Buffer) {
  const target = path.join(MEDIA_DIR, name);
  const tmp = `${target}.upload`;
  await writeFile(tmp, data);
  await rename(tmp, target);
}
