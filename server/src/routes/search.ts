import type { FastifyInstance } from 'fastify';
import { db, type SearchRow } from '../db.js';
import { notifyWorker } from '../jobs.js';
import { importInfo, usesWorker } from '../library.js';
import { searchYoutube, type SearchResult } from '../ytdlp.js';

type IdParams = { Params: { id: string } };

function getSearch(id: number) {
  return db.prepare('SELECT * FROM searches WHERE id = ?').get(id) as SearchRow | undefined;
}

/** Resultados com a marca "já está na biblioteca". */
function toSearch(row: SearchRow) {
  const results = row.results ? (JSON.parse(row.results) as SearchResult[]) : [];
  const inLibrary = db.prepare('SELECT 1 FROM tracks WHERE source_id = ?');
  return {
    id: row.id,
    query: row.query,
    status: row.status,
    error: row.error,
    results: results.map((r) => ({ ...r, inLibrary: Boolean(inLibrary.get(`Youtube:${r.id}`)) })),
  };
}

export async function searchRoutes(app: FastifyInstance) {
  /** Modo worker: devolve a busca pendente para o app acompanhar. Modo local: já com resultados. */
  app.post<{ Body: { q?: string } }>('/api/search', async (req, reply) => {
    const query = req.body?.q?.trim();
    if (!query) return reply.code(400).send({ error: 'Digite o que buscar.' });

    db.exec("DELETE FROM searches WHERE created_at < datetime('now', '-1 hour')");
    const { lastInsertRowid } = db.prepare('INSERT INTO searches (query) VALUES (?)').run(query);
    const id = Number(lastInsertRowid);

    if (usesWorker()) {
      notifyWorker();
      return reply.code(202).send(toSearch(getSearch(id)!));
    }
    try {
      const results = await searchYoutube(query);
      db.prepare("UPDATE searches SET status = 'done', results = ? WHERE id = ?").run(JSON.stringify(results), id);
    } catch (err) {
      db.prepare("UPDATE searches SET status = 'error', error = ? WHERE id = ?").run((err as Error).message, id);
    }
    return toSearch(getSearch(id)!);
  });

  app.get<IdParams>('/api/search/:id', async (req, reply) => {
    const row = getSearch(Number(req.params.id));
    return row ? toSearch(row) : reply.code(404).send({ error: 'Busca expirada.' });
  });

  /** Adiciona um resultado à biblioteca, com os dados que vieram na busca (sem consultar de novo). */
  app.post<IdParams & { Body: { videoId?: string } }>('/api/search/:id/add', async (req, reply) => {
    const row = getSearch(Number(req.params.id));
    const result = row?.results
      ? (JSON.parse(row.results) as SearchResult[]).find((r) => r.id === req.body?.videoId)
      : undefined;
    if (!result) return reply.code(404).send({ error: 'Resultado não encontrado; busque de novo.' });
    return importInfo({
      id: result.id,
      extractor_key: 'Youtube',
      webpage_url: result.url,
      title: result.title,
      channel: result.channel ?? undefined,
      duration: result.duration ?? undefined,
    });
  });
}
