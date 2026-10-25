export type TrackStatus = 'pending' | 'downloading' | 'ready' | 'error';

export interface Track {
  id: number;
  title: string;
  artist: string | null;
  album: string | null;
  duration: number | null;
  status: TrackStatus;
  error: string | null;
  /** Percentual geral do download (0–100), enquanto baixa. */
  progress: number | null;
  stage: 'preparing' | 'downloading' | 'processing' | 'normalizing' | 'uploading' | null;
  hasCover: boolean;
  favorite: boolean;
  sourceUrl: string;
  createdAt: string;
}

export interface PlaylistSummary {
  id: number;
  name: string;
  trackCount: number;
  coverTrackId: number | null;
}

export type SmartKind = 'favorites' | 'recent' | 'top';

/** Lista automática (Favoritas, Tocadas recentemente, Mais tocadas). */
export interface SmartSummary {
  kind: SmartKind;
  name: string;
  trackCount: number;
  coverTrackId: number | null;
}

export interface SmartList {
  kind: SmartKind;
  name: string;
  tracks: Track[];
}

export interface Playlist {
  id: number;
  name: string;
  tracks: Track[];
}

export interface SearchResult {
  id: string;
  title: string;
  channel: string | null;
  duration: number | null;
  url: string;
  inLibrary: boolean;
}

export interface Search {
  id: number;
  query: string;
  status: 'pending' | 'processing' | 'done' | 'error';
  error: string | null;
  results: SearchResult[];
}

/** URL aguardando o worker (servidor com DOWNLOAD_MODE=worker). */
export interface ImportJob {
  id: number;
  url: string;
  status: 'pending' | 'processing' | 'error';
  error: string | null;
  createdAt: string;
}

export interface ServerStatus {
  downloadMode: 'local' | 'worker';
  worker: { online: boolean; lastSeen: string | null };
  waiting: { tracks: number; imports: number };
}

export type ImportResult =
  | { kind: 'queued'; importId: number }
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
    // Sessão expirada/ausente: o AuthGate escuta e mostra a tela de login.
    if (res.status === 401 && url !== '/api/login') window.dispatchEvent(new Event('unauthorized'));
    const data = await res.json().catch(() => null);
    throw new Error(data?.error ?? `Erro ${res.status}`);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export interface Session {
  authenticated: boolean;
  required: boolean;
}

export const api = {
  session: () => request<Session>('GET', '/api/session'),
  login: (password: string) => request<Session>('POST', '/api/login', { password }),
  logout: () => request<Session>('POST', '/api/logout'),

  tracks: () => request<Track[]>('GET', '/api/tracks'),
  importUrl: (url: string) => request<ImportResult>('POST', '/api/import', { url }),
  search: (q: string) => request<Search>('POST', '/api/search', { q }),
  getSearch: (id: number) => request<Search>('GET', `/api/search/${id}`),
  addSearchResult: (searchId: number, videoId: string) =>
    request<ImportResult>('POST', `/api/search/${searchId}/add`, { videoId }),
  imports: () => request<ImportJob[]>('GET', '/api/imports'),
  retryImport: (id: number) => request<void>('POST', `/api/imports/${id}/retry`),
  deleteImport: (id: number) => request<void>('DELETE', `/api/imports/${id}`),
  status: () => request<ServerStatus>('GET', '/api/status'),
  updateTrack: (id: number, data: Pick<Track, 'title' | 'artist' | 'album'>) =>
    request<Track>('PATCH', `/api/tracks/${id}`, data),
  trackPlaylists: (id: number) => request<number[]>('GET', `/api/tracks/${id}/playlists`),
  retryTrack: (id: number) => request<Track>('POST', `/api/tracks/${id}/retry`),
  deleteTrack: (id: number) => request<void>('DELETE', `/api/tracks/${id}`),

  setFavorite: (id: number, favorite: boolean) =>
    request<Track>('POST', `/api/tracks/${id}/favorite`, { favorite }),
  recordPlay: (id: number, playedAt?: string) =>
    request<void>('POST', `/api/tracks/${id}/play`, { playedAt }),
  smartLists: () => request<SmartSummary[]>('GET', '/api/smart'),
  smartList: (kind: SmartKind) => request<SmartList>('GET', `/api/smart/${kind}`),

  playlists: () => request<PlaylistSummary[]>('GET', '/api/playlists'),
  playlist: (id: number) => request<Playlist>('GET', `/api/playlists/${id}`),
  createPlaylist: (name: string) => request<PlaylistSummary>('POST', '/api/playlists', { name }),
  renamePlaylist: (id: number, name: string) => request('PATCH', `/api/playlists/${id}`, { name }),
  deletePlaylist: (id: number) => request<void>('DELETE', `/api/playlists/${id}`),
  addToPlaylist: (id: number, trackId: number) =>
    request<void>('POST', `/api/playlists/${id}/tracks`, { trackId }),
  reorderPlaylist: (id: number, trackIds: number[]) =>
    request<void>('PUT', `/api/playlists/${id}/tracks`, { trackIds }),
  removeFromPlaylist: (id: number, trackId: number) =>
    request<void>('DELETE', `/api/playlists/${id}/tracks/${trackId}`),
};

export const audioUrl = (id: number) => `/api/tracks/${id}/audio`;
export const coverUrl = (id: number) => `/api/tracks/${id}/cover`;

export const songCount = (n: number) => `${n} música${n === 1 ? '' : 's'}`;

export function formatBytes(bytes: number) {
  if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 ** 3) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1).replace('.', ',')} GB`;
}

export function formatTime(seconds: number | null | undefined) {
  if (!seconds || !Number.isFinite(seconds)) return '0:00';
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}
