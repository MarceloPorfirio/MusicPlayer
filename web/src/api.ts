export type TrackStatus = 'pending' | 'downloading' | 'ready' | 'error';

export interface Track {
  id: number;
  title: string;
  artist: string | null;
  album: string | null;
  duration: number | null;
  status: TrackStatus;
  error: string | null;
  progress: number | null;
  hasCover: boolean;
  sourceUrl: string;
  createdAt: string;
}

export interface PlaylistSummary {
  id: number;
  name: string;
  trackCount: number;
  coverTrackId: number | null;
}

export interface Playlist {
  id: number;
  name: string;
  tracks: Track[];
}

export type ImportResult =
  | { kind: 'track'; track: Track }
  | {
      kind: 'playlist';
      playlist: { id: number; name: string };
      added: number;
      existing: number;
      skipped: number;
    };

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? `Erro ${res.status}`);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export const api = {
  tracks: () => request<Track[]>('GET', '/api/tracks'),
  importUrl: (url: string) => request<ImportResult>('POST', '/api/import', { url }),
  retryTrack: (id: number) => request<Track>('POST', `/api/tracks/${id}/retry`),
  deleteTrack: (id: number) => request<void>('DELETE', `/api/tracks/${id}`),

  playlists: () => request<PlaylistSummary[]>('GET', '/api/playlists'),
  playlist: (id: number) => request<Playlist>('GET', `/api/playlists/${id}`),
  createPlaylist: (name: string) => request<PlaylistSummary>('POST', '/api/playlists', { name }),
  renamePlaylist: (id: number, name: string) => request('PATCH', `/api/playlists/${id}`, { name }),
  deletePlaylist: (id: number) => request<void>('DELETE', `/api/playlists/${id}`),
  addToPlaylist: (id: number, trackId: number) =>
    request<void>('POST', `/api/playlists/${id}/tracks`, { trackId }),
  removeFromPlaylist: (id: number, trackId: number) =>
    request<void>('DELETE', `/api/playlists/${id}/tracks/${trackId}`),
};

export const audioUrl = (id: number) => `/api/tracks/${id}/audio`;
export const coverUrl = (id: number) => `/api/tracks/${id}/cover`;

export function formatTime(seconds: number | null | undefined) {
  if (!seconds || !Number.isFinite(seconds)) return '0:00';
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}
