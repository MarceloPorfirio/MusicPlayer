import type { FastifyInstance } from 'fastify';
import { db, type PlaylistRow, type TrackRow } from '../db.js';
import { toTrack } from '../library.js';

type IdParams = { Params: { id: string } };

function getPlaylist(id: number) {
  return db.prepare('SELECT * FROM playlists WHERE id = ?').get(id) as PlaylistRow | undefined;
}

function playlistTracks(id: number) {
  const rows = db
    .prepare(
      `SELECT t.* FROM playlist_tracks pt
       JOIN tracks t ON t.id = pt.track_id
       WHERE pt.playlist_id = ? ORDER BY pt.position`,
    )
    .all(id) as unknown as TrackRow[];
  return rows.map(toTrack);
}

export async function playlistRoutes(app: FastifyInstance) {
  app.get('/api/playlists', async () => {
    return db
      .prepare(
        `SELECT p.id, p.name, p.created_at AS createdAt,
                COUNT(pt.track_id) AS trackCount,
                (SELECT pt2.track_id FROM playlist_tracks pt2
                 JOIN tracks t ON t.id = pt2.track_id AND t.cover IS NOT NULL
                 WHERE pt2.playlist_id = p.id ORDER BY pt2.position LIMIT 1) AS coverTrackId
         FROM playlists p
         LEFT JOIN playlist_tracks pt ON pt.playlist_id = p.id
         GROUP BY p.id ORDER BY p.name COLLATE NOCASE`,
      )
      .all();
  });

  /** Ids das playlists que contêm a faixa. */
  app.get<IdParams>('/api/tracks/:id/playlists', async (req) => {
    const rows = db
      .prepare('SELECT playlist_id FROM playlist_tracks WHERE track_id = ?')
      .all(Number(req.params.id)) as unknown as { playlist_id: number }[];
    return rows.map((r) => r.playlist_id);
  });

  app.post<{ Body: { name?: string } }>('/api/playlists', async (req, reply) => {
    const name = req.body?.name?.trim();
    if (!name) return reply.code(400).send({ error: 'Informe um nome.' });
    const { lastInsertRowid } = db.prepare('INSERT INTO playlists (name) VALUES (?)').run(name);
    return reply.code(201).send({ id: Number(lastInsertRowid), name, trackCount: 0 });
  });

  app.get<IdParams>('/api/playlists/:id', async (req, reply) => {
    const playlist = getPlaylist(Number(req.params.id));
    if (!playlist) return reply.code(404).send({ error: 'Playlist não encontrada.' });
    return { id: playlist.id, name: playlist.name, tracks: playlistTracks(playlist.id) };
  });

  app.patch<IdParams & { Body: { name?: string } }>('/api/playlists/:id', async (req, reply) => {
    const name = req.body?.name?.trim();
    if (!name) return reply.code(400).send({ error: 'Informe um nome.' });
    const { changes } = db.prepare('UPDATE playlists SET name = ? WHERE id = ?').run(name, Number(req.params.id));
    if (!changes) return reply.code(404).send({ error: 'Playlist não encontrada.' });
    return { id: Number(req.params.id), name };
  });

  app.delete<IdParams>('/api/playlists/:id', async (req, reply) => {
    db.prepare('DELETE FROM playlists WHERE id = ?').run(Number(req.params.id));
    return reply.code(204).send();
  });

  app.post<IdParams & { Body: { trackId?: number } }>(
    '/api/playlists/:id/tracks',
    async (req, reply) => {
      const playlistId = Number(req.params.id);
      const trackId = Number(req.body?.trackId);
      if (!getPlaylist(playlistId)) return reply.code(404).send({ error: 'Playlist não encontrada.' });
      try {
        db.prepare(
          `INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position)
           VALUES (?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM playlist_tracks WHERE playlist_id = ?))`,
        ).run(playlistId, trackId, playlistId);
      } catch {
        return reply.code(400).send({ error: 'Faixa inválida.' });
      }
      return reply.code(204).send();
    },
  );

  app.put<IdParams & { Body: { trackIds?: number[] } }>(
    '/api/playlists/:id/tracks',
    async (req, reply) => {
      const playlistId = Number(req.params.id);
      const ids = req.body?.trackIds;
      if (!Array.isArray(ids)) return reply.code(400).send({ error: 'Envie trackIds.' });
      const update = db.prepare(
        'UPDATE playlist_tracks SET position = ? WHERE playlist_id = ? AND track_id = ?',
      );
      db.exec('BEGIN');
      try {
        ids.forEach((trackId, i) => update.run(i, playlistId, trackId));
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
      return reply.code(204).send();
    },
  );

  app.delete<{ Params: { id: string; trackId: string } }>(
    '/api/playlists/:id/tracks/:trackId',
    async (req, reply) => {
      db.prepare('DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?').run(
        Number(req.params.id),
        Number(req.params.trackId),
      );
      return reply.code(204).send();
    },
  );
}
