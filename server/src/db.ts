import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { DB_PATH, MEDIA_DIR } from './config.js';

mkdirSync(MEDIA_DIR, { recursive: true });

export const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS tracks (
    id          INTEGER PRIMARY KEY,
    source_id   TEXT NOT NULL UNIQUE,
    source_url  TEXT NOT NULL,
    title       TEXT NOT NULL,
    artist      TEXT,
    album       TEXT,
    duration    INTEGER,
    status      TEXT NOT NULL DEFAULT 'pending', -- pending | downloading | ready | error
    error       TEXT,
    file        TEXT,
    cover       TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS playlists (
    id          INTEGER PRIMARY KEY,
    name        TEXT NOT NULL,
    source_id   TEXT, -- playlist de origem quando importada (ex.: YoutubeTab:PL...)
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS playlist_tracks (
    playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
    track_id    INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    position    INTEGER NOT NULL,
    PRIMARY KEY (playlist_id, track_id)
  );
`);

// URLs aguardando o worker (DOWNLOAD_MODE=worker). Some ao ser processada.
db.exec(`
  CREATE TABLE IF NOT EXISTS imports (
    id          INTEGER PRIMARY KEY,
    url         TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending', -- pending | processing | error
    error       TEXT,
    claimed_at  TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Migrações de bancos criados antes da coluna existir.
const trackCols = db.prepare('PRAGMA table_info(tracks)').all() as unknown as { name: string }[];
if (!trackCols.some((c) => c.name === 'claimed_at')) {
  // Quando o worker pegou a faixa: se ele sumir, ela volta para a fila depois de um tempo.
  db.exec('ALTER TABLE tracks ADD COLUMN claimed_at TEXT');
}
if (!trackCols.some((c) => c.name === 'normalized')) {
  // Volume normalizado (-14 LUFS)? 1 = sim, 0 = ainda não (o worker faz aos poucos), -1 = falhou.
  db.exec('ALTER TABLE tracks ADD COLUMN normalized INTEGER NOT NULL DEFAULT 0');
}
const playlistCols = db.prepare('PRAGMA table_info(playlists)').all() as unknown as { name: string }[];
if (!playlistCols.some((c) => c.name === 'source_id')) {
  db.exec('ALTER TABLE playlists ADD COLUMN source_id TEXT');
}
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS playlists_source_id ON playlists(source_id)');

export type TrackStatus = 'pending' | 'downloading' | 'ready' | 'error';

export interface TrackRow {
  id: number;
  source_id: string;
  source_url: string;
  title: string;
  artist: string | null;
  album: string | null;
  duration: number | null;
  status: TrackStatus;
  error: string | null;
  file: string | null;
  cover: string | null;
  claimed_at: string | null;
  normalized: number;
  created_at: string;
}

export interface ImportRow {
  id: number;
  url: string;
  status: 'pending' | 'processing' | 'error';
  error: string | null;
  claimed_at: string | null;
  created_at: string;
}

export interface PlaylistRow {
  id: number;
  name: string;
  source_id: string | null;
  created_at: string;
}
