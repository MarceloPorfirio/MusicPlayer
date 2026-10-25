import { DOWNLOAD_MODE } from './config.js';
import { db, type PlaylistRow, type TrackRow } from './db.js';
import { enqueue, progress } from './downloads.js';
import { describe, entryToInfo, type MediaInfo } from './ytdlp.js';

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

export function getTrack(id: number) {
  return db.prepare('SELECT * FROM tracks WHERE id = ?').get(id) as TrackRow | undefined;
}

/**
 * Cadastra a faixa ou reaproveita a existente. `download` indica se ela precisa ir
 * para a fila (nova ou com erro) — quem chama enfileira, depois de commitar.
 */
function addTrack(info: MediaInfo): { id: number; created: boolean; download: boolean } {
  const meta = describe(info);
  const existing = db.prepare('SELECT id, status FROM tracks WHERE source_id = ?').get(meta.sourceId) as
    | Pick<TrackRow, 'id' | 'status'>
    | undefined;
  if (existing) {
    return { id: existing.id, created: false, download: existing.status === 'error' };
  }
  const { lastInsertRowid } = db
    .prepare(
      'INSERT INTO tracks (source_id, source_url, title, artist, album, duration) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .run(meta.sourceId, meta.sourceUrl, meta.title, meta.artist, meta.album, meta.duration);
  return { id: Number(lastInsertRowid), created: true, download: true };
}

export type ImportResult =
  | { kind: 'track'; created: boolean; track: ReturnType<typeof toTrack> }
  | {
      kind: 'playlist';
      playlist: { id: number; name: string };
      added: number;
      existing: number;
      skipped: number;
    }
  | { kind: 'queued'; importId: number };

/** Vídeo vira faixa; playlist vira playlist com todas as faixas (reimportar sincroniza). */
export function importInfo(info: MediaInfo): ImportResult {
  if (info._type !== 'playlist') {
    const { id, created, download } = addTrack(info);
    if (download) enqueue(id);
    return { kind: 'track', created, track: toTrack(getTrack(id)!) };
  }

  const sourceId = `${info.extractor_key}:${info.id}`;
  let playlist = db.prepare('SELECT * FROM playlists WHERE source_id = ?').get(sourceId) as
    | PlaylistRow
    | undefined;
  if (!playlist) {
    const { lastInsertRowid } = db
      .prepare('INSERT INTO playlists (name, source_id) VALUES (?, ?)')
      .run(info.title || 'Playlist importada', sourceId);
    playlist = { id: Number(lastInsertRowid), name: info.title, source_id: sourceId, created_at: '' };
  }

  const link = db.prepare(
    `INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position)
     VALUES (?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM playlist_tracks WHERE playlist_id = ?))`,
  );
  let added = 0;
  let existing = 0;
  let skipped = 0;
  const toDownload: number[] = [];
  db.exec('BEGIN');
  try {
    for (const entry of info.entries ?? []) {
      const entryInfo = entryToInfo(entry);
      if (!entryInfo) {
        skipped++;
        continue;
      }
      const { id, created, download } = addTrack(entryInfo);
      if (created) added++;
      else existing++;
      if (download) toDownload.push(id);
      link.run(playlist.id, id, playlist.id);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  toDownload.forEach((id) => enqueue(id));

  return {
    kind: 'playlist',
    playlist: { id: playlist.id, name: playlist.name },
    added,
    existing,
    skipped,
  };
}

/** Modo worker: guarda a URL para o worker buscar. */
export function queueImport(url: string): ImportResult {
  const { lastInsertRowid } = db.prepare('INSERT INTO imports (url) VALUES (?)').run(url);
  return { kind: 'queued', importId: Number(lastInsertRowid) };
}

export const usesWorker = () => DOWNLOAD_MODE === 'worker';
