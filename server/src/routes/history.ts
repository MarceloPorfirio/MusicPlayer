import type { FastifyInstance } from 'fastify';
import { db, type TrackRow } from '../db.js';
import { getTrack, toTrack } from '../library.js';

type IdParams = { Params: { id: string } };

const LIMIT = 100;

/** Listas automáticas, com o mesmo formato de uma playlist. */
const SMART_LISTS = {
  favorites: {
    name: 'Favoritas',
    sql: 'SELECT * FROM tracks WHERE favorite = 1 ORDER BY title COLLATE NOCASE',
  },
  recent: {
    name: 'Tocadas recentemente',
    sql: `SELECT t.* FROM tracks t
          JOIN (SELECT track_id, MAX(played_at) AS last FROM plays GROUP BY track_id) p ON p.track_id = t.id
          ORDER BY p.last DESC LIMIT ${LIMIT}`,
  },
  top: {
    name: 'Mais tocadas',
    sql: `SELECT t.* FROM tracks t
          JOIN (SELECT track_id, COUNT(*) AS n, MAX(played_at) AS last FROM plays GROUP BY track_id) p
            ON p.track_id = t.id
          ORDER BY p.n DESC, p.last DESC LIMIT ${LIMIT}`,
  },
} as const;

type SmartKind = keyof typeof SMART_LISTS;

export async function historyRoutes(app: FastifyInstance) {
  app.post<IdParams & { Body: { favorite?: boolean } }>('/api/tracks/:id/favorite', async (req, reply) => {
    const id = Number(req.params.id);
    const { changes } = db
      .prepare('UPDATE tracks SET favorite = ? WHERE id = ?')
      .run(req.body?.favorite ? 1 : 0, id);
    return changes ? toTrack(getTrack(id)!) : reply.code(404).send({ error: 'Faixa não encontrada.' });
  });

  /**
   * Registra que a faixa foi ouvida. `playedAt` (ISO) vem das reproduções feitas sem internet,
   * enviadas depois; sem ele, vale o horário de agora.
   */
  app.post<IdParams & { Body: { playedAt?: string } }>('/api/tracks/:id/play', async (req, reply) => {
    const id = Number(req.params.id);
    if (!getTrack(id)) return reply.code(204).send(); // apagada nesse meio-tempo: ignora
    const when = req.body?.playedAt ? new Date(req.body.playedAt) : new Date();
    const playedAt = Number.isNaN(when.getTime()) ? new Date() : when;
    db.prepare('INSERT INTO plays (track_id, played_at) VALUES (?, ?)').run(
      id,
      playedAt.toISOString().replace('T', ' ').slice(0, 19),
    );
    return reply.code(204).send();
  });

  /** Resumo para os cartões da aba Playlists. */
  app.get('/api/smart', async () => {
    return (Object.keys(SMART_LISTS) as SmartKind[]).map((kind) => {
      const rows = db.prepare(SMART_LISTS[kind].sql).all() as unknown as TrackRow[];
      return {
        kind,
        name: SMART_LISTS[kind].name,
        trackCount: rows.length,
        coverTrackId: rows.find((r) => r.cover)?.id ?? null,
      };
    });
  });

  app.get<{ Params: { kind: string } }>('/api/smart/:kind', async (req, reply) => {
    const list = SMART_LISTS[req.params.kind as SmartKind];
    if (!list) return reply.code(404).send({ error: 'Lista não encontrada.' });
    const rows = db.prepare(list.sql).all() as unknown as TrackRow[];
    return { kind: req.params.kind, name: list.name, tracks: rows.map(toTrack) };
  });
}
