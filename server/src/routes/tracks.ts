import { rm } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { MEDIA_DIR } from '../config.js';
import { db, type ImportRow, type TrackRow } from '../db.js';
import { enqueue } from '../downloads.js';
import { notifyWorker } from '../jobs.js';
import { getTrack, importInfo, queueImport, toTrack, usesWorker } from '../library.js';
import { fetchInfo } from '../ytdlp.js';

type IdParams = { Params: { id: string } };

export async function trackRoutes(app: FastifyInstance) {
  app.get('/api/tracks', async () => {
    const rows = db.prepare('SELECT * FROM tracks ORDER BY id DESC').all() as unknown as TrackRow[];
    return rows.map(toTrack);
  });

  /** Vídeo vira faixa; playlist vira playlist com todas as faixas (reimportar sincroniza). */
  app.post<{ Body: { url?: string } }>('/api/import', async (req, reply) => {
    const url = req.body?.url?.trim();
    if (!url || !URL.canParse(url)) {
      return reply.code(400).send({ error: 'Informe uma URL válida.' });
    }

    // Modo worker: o servidor nunca acessa o YouTube; o worker busca a URL depois.
    if (usesWorker()) return reply.code(202).send(queueImport(url));

    let info;
    try {
      info = await fetchInfo(url);
    } catch (err) {
      return reply.code(422).send({ error: (err as Error).message });
    }
    const result = importInfo(info);
    return reply.code(result.kind === 'track' && !result.created ? 200 : 201).send(result);
  });

  /** URLs aguardando o worker (ou que falharam nele). */
  app.get('/api/imports', async () => {
    const rows = db.prepare('SELECT * FROM imports ORDER BY id').all() as unknown as ImportRow[];
    return rows.map((r) => ({ id: r.id, url: r.url, status: r.status, error: r.error, createdAt: r.created_at }));
  });

  app.post<IdParams>('/api/imports/:id/retry', async (req, reply) => {
    const { changes } = db
      .prepare("UPDATE imports SET status = 'pending', error = NULL, claimed_at = NULL WHERE id = ?")
      .run(Number(req.params.id));
    if (!changes) return reply.code(404).send({ error: 'Importação não encontrada.' });
    notifyWorker();
    return reply.code(204).send();
  });

  app.delete<IdParams>('/api/imports/:id', async (req, reply) => {
    db.prepare('DELETE FROM imports WHERE id = ?').run(Number(req.params.id));
    return reply.code(204).send();
  });

  app.patch<IdParams & { Body: { title?: string; artist?: string; album?: string } }>(
    '/api/tracks/:id',
    async (req, reply) => {
      const track = getTrack(Number(req.params.id));
      if (!track) return reply.code(404).send({ error: 'Faixa não encontrada.' });
      const { title = track.title, artist = track.artist, album = track.album } = req.body ?? {};
      if (!title.trim()) return reply.code(400).send({ error: 'O título não pode ficar vazio.' });
      db.prepare('UPDATE tracks SET title = ?, artist = ?, album = ? WHERE id = ?').run(
        title,
        artist,
        album,
        track.id,
      );
      return toTrack(getTrack(track.id)!);
    },
  );

  app.post<IdParams>('/api/tracks/:id/retry', async (req, reply) => {
    const track = getTrack(Number(req.params.id));
    if (!track) return reply.code(404).send({ error: 'Faixa não encontrada.' });
    enqueue(track.id);
    return toTrack(track);
  });

  app.delete<IdParams>('/api/tracks/:id', async (req, reply) => {
    const track = getTrack(Number(req.params.id));
    if (!track) return reply.code(404).send({ error: 'Faixa não encontrada.' });
    if (track.status === 'downloading') {
      return reply.code(409).send({ error: 'Aguarde o download terminar para remover.' });
    }
    db.prepare('DELETE FROM tracks WHERE id = ?').run(track.id);
    for (const f of [track.file, track.cover]) {
      if (f) await rm(path.join(MEDIA_DIR, f), { force: true });
    }
    return reply.code(204).send();
  });

  app.get<IdParams>('/api/tracks/:id/audio', async (req, reply) => {
    const track = getTrack(Number(req.params.id));
    if (!track?.file) return reply.code(404).send({ error: 'Áudio indisponível.' });
    // Sem cache "imutável": o arquivo pode ser trocado no mesmo endereço (normalização de
    // volume). O navegador revalida pelo ETag e recebe 304 enquanto não mudar.
    return reply.sendFile(track.file, MEDIA_DIR, { maxAge: 0 });
  });

  app.get<IdParams>('/api/tracks/:id/cover', async (req, reply) => {
    const track = getTrack(Number(req.params.id));
    if (!track?.cover) return reply.code(404).send({ error: 'Sem capa.' });
    return reply.sendFile(track.cover, MEDIA_DIR, { maxAge: '365d', immutable: true });
  });
}
