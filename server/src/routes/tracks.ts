import { rm } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { MEDIA_DIR } from '../config.js';
import { db, type TrackRow } from '../db.js';
import { enqueue, progress } from '../downloads.js';
import { describe, fetchInfo } from '../ytdlp.js';

export function toTrack(row: TrackRow) {
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    album: row.album,
    duration: row.duration,
    status: row.status,
    error: row.error,
    progress: progress.get(row.id) ?? null,
    hasCover: row.cover !== null,
    sourceUrl: row.source_url,
    createdAt: row.created_at,
  };
}

function getTrack(id: number) {
  return db.prepare('SELECT * FROM tracks WHERE id = ?').get(id) as TrackRow | undefined;
}

type IdParams = { Params: { id: string } };

export async function trackRoutes(app: FastifyInstance) {
  app.get('/api/tracks', async () => {
    const rows = db.prepare('SELECT * FROM tracks ORDER BY id DESC').all() as unknown as TrackRow[];
    return rows.map(toTrack);
  });

  app.post<{ Body: { url?: string } }>('/api/tracks', async (req, reply) => {
    const url = req.body?.url?.trim();
    if (!url || !URL.canParse(url)) {
      return reply.code(400).send({ error: 'Informe uma URL válida.' });
    }

    let info;
    try {
      info = await fetchInfo(url);
    } catch (err) {
      return reply.code(422).send({ error: (err as Error).message });
    }
    if (info._type === 'playlist') {
      return reply.code(422).send({ error: 'URLs de playlist ainda não são suportadas.' });
    }

    const meta = describe(info);
    const existing = db.prepare('SELECT * FROM tracks WHERE source_id = ?').get(meta.sourceId) as
      | TrackRow
      | undefined;
    if (existing) {
      if (existing.status === 'error') enqueue(existing.id);
      return reply.code(200).send(toTrack(getTrack(existing.id)!));
    }

    const { lastInsertRowid } = db
      .prepare(
        'INSERT INTO tracks (source_id, source_url, title, artist, album, duration) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(meta.sourceId, meta.sourceUrl, meta.title, meta.artist, meta.album, meta.duration);
    const id = Number(lastInsertRowid);
    enqueue(id);
    return reply.code(201).send(toTrack(getTrack(id)!));
  });

  app.patch<IdParams & { Body: { title?: string; artist?: string; album?: string } }>(
    '/api/tracks/:id',
    async (req, reply) => {
      const track = getTrack(Number(req.params.id));
      if (!track) return reply.code(404).send({ error: 'Faixa não encontrada.' });
      const { title = track.title, artist = track.artist, album = track.album } = req.body ?? {};
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
    return reply.sendFile(track.file, MEDIA_DIR, { maxAge: '365d', immutable: true });
  });

  app.get<IdParams>('/api/tracks/:id/cover', async (req, reply) => {
    const track = getTrack(Number(req.params.id));
    if (!track?.cover) return reply.code(404).send({ error: 'Sem capa.' });
    return reply.sendFile(track.cover, MEDIA_DIR, { maxAge: '365d', immutable: true });
  });
}
