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
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS playlist_tracks (
    playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
    track_id    INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    position    INTEGER NOT NULL,
    PRIMARY KEY (playlist_id, track_id)
  );
`);

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
  created_at: string;
}

export interface PlaylistRow {
  id: number;
  name: string;
  created_at: string;
}
