import { existsSync } from 'node:fs';
import path from 'node:path';
import { DOWNLOAD_CONCURRENCY, MEDIA_DIR } from './config.js';
import { db, type TrackRow } from './db.js';
import { downloadAudio } from './ytdlp.js';

/** Progresso em memória (0-100) dos downloads em andamento, por id da faixa. */
export const progress = new Map<number, number>();

const queue: number[] = [];
let active = 0;

export function enqueue(trackId: number) {
  if (queue.includes(trackId) || progress.has(trackId)) return;
  queue.push(trackId);
  pump();
}

function pump() {
  while (active < DOWNLOAD_CONCURRENCY && queue.length) {
    const id = queue.shift()!;
    active++;
    download(id).finally(() => {
      active--;
      pump();
    });
  }
}

async function download(id: number) {
  const track = db.prepare('SELECT * FROM tracks WHERE id = ?').get(id) as TrackRow | undefined;
  if (!track) return;

  db.prepare("UPDATE tracks SET status = 'downloading', error = NULL WHERE id = ?").run(id);
  progress.set(id, 0);
  try {
    const { file, cover } = await downloadAudio(track.source_url, `track-${id}`, (p) =>
      progress.set(id, p),
    );
    const hasCover = existsSync(path.join(MEDIA_DIR, cover));
    db.prepare("UPDATE tracks SET status = 'ready', file = ?, cover = ? WHERE id = ?").run(
      file,
      hasCover ? cover : null,
      id,
    );
  } catch (err) {
    db.prepare("UPDATE tracks SET status = 'error', error = ? WHERE id = ?").run(
      (err as Error).message,
      id,
    );
  } finally {
    progress.delete(id);
  }
}

/** Retoma downloads interrompidos quando o servidor reinicia. */
export function resumePending() {
  const rows = db
    .prepare("SELECT id FROM tracks WHERE status IN ('pending', 'downloading') ORDER BY id")
    .all() as unknown as { id: number }[];
  rows.forEach((r) => enqueue(r.id));
}
