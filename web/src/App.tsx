import { useCallback, useEffect, useState } from 'react';
import { api, type PlaylistSummary, type Track } from './api';
import { AddToPlaylistDialog } from './components/AddToPlaylistDialog';
import { AddTrackForm } from './components/AddTrackForm';
import { PlayerBar } from './components/PlayerBar';
import { PlaylistView } from './components/PlaylistView';
import { PlaylistsView } from './components/PlaylistsView';
import { TrackList } from './components/TrackList';
import { PlayIcon, ShuffleIcon } from './components/icons';
import { useOffline } from './offline';
import { usePlayer } from './player';

type View = { kind: 'library' } | { kind: 'playlists' } | { kind: 'playlist'; id: number };

export function App({ onLogout }: { onLogout?: () => void }) {
  const [view, setView] = useState<View>({ kind: 'library' });
  const [tracks, setTracks] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [addingTrack, setAddingTrack] = useState<Track | null>(null);
  const [query, setQuery] = useState('');
  const { playTracks, forget } = usePlayer();
  const offline = useOffline();

  const loadTracks = useCallback(() => api.tracks().then(setTracks), []);
  const loadPlaylists = useCallback(() => api.playlists().then(setPlaylists), []);

  useEffect(() => {
    void loadTracks();
    void loadPlaylists();
  }, [loadTracks, loadPlaylists]);

  // Enquanto houver downloads em andamento, atualiza a lista periodicamente.
  const busy = tracks.some((t) => t.status === 'pending' || t.status === 'downloading');
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(loadTracks, 1500);
    return () => clearInterval(timer);
  }, [busy, loadTracks]);

  const q = query.trim().toLowerCase();
  const visibleTracks = q
    ? tracks.filter((t) => `${t.title} ${t.artist ?? ''} ${t.album ?? ''}`.toLowerCase().includes(q))
    : tracks;

  return (
    <div className="app">
      <header className="top-bar">
        <h1>MusicPlayer</h1>
        <nav className="tabs">
          <button
            className={view.kind === 'library' ? 'active' : undefined}
            onClick={() => setView({ kind: 'library' })}
          >
            Biblioteca
          </button>
          <button
            className={view.kind !== 'library' ? 'active' : undefined}
            onClick={() => setView({ kind: 'playlists' })}
          >
            Playlists
          </button>
          {onLogout && <button onClick={onLogout}>Sair</button>}
        </nav>
      </header>

      {!offline.online && (
        <div className="offline-banner">Sem conexão: tocando só as músicas baixadas no aparelho.</div>
      )}

      <main className="content">
        {view.kind === 'library' && (
          <>
            <AddTrackForm onAdded={() => void Promise.all([loadTracks(), loadPlaylists()])} />
            {tracks.length > 5 && (
              <input
                className="search"
                type="search"
                placeholder="Buscar na biblioteca…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            )}
            {visibleTracks.some(offline.canPlay) && (
              <div className="list-actions">
                <button className="btn primary" onClick={() => playTracks(visibleTracks)}>
                  <PlayIcon width={18} height={18} /> Tocar tudo
                </button>
                <button
                  className="btn"
                  onClick={() => playTracks(visibleTracks, undefined, true)}
                >
                  <ShuffleIcon width={18} height={18} /> Aleatório
                </button>
              </div>
            )}
            <TrackList
              tracks={visibleTracks}
              onAddToPlaylist={setAddingTrack}
              onEdited={() => void Promise.all([loadTracks(), loadPlaylists()])}
              onRetry={async (t) => {
                await api.retryTrack(t.id);
                await loadTracks();
              }}
              removeLabel="Apagar da biblioteca"
              onRemove={async (t) => {
                if (!confirm(`Apagar "${t.title}" da biblioteca e de todas as playlists?`)) return;
                try {
                  await api.deleteTrack(t.id);
                  forget(t.id);
                  await offline.remove([t]);
                } catch (err) {
                  alert((err as Error).message);
                }
                await Promise.all([loadTracks(), loadPlaylists()]);
              }}
            />
          </>
        )}

        {view.kind === 'playlists' && (
          <PlaylistsView
            playlists={playlists}
            onOpen={(id) => setView({ kind: 'playlist', id })}
            onChanged={loadPlaylists}
          />
        )}

        {view.kind === 'playlist' && (
          <PlaylistView
            id={view.id}
            onBack={() => setView({ kind: 'playlists' })}
            onChanged={loadPlaylists}
          />
        )}
      </main>

      <PlayerBar />

      {addingTrack && (
        <AddToPlaylistDialog
          track={addingTrack}
          playlists={playlists}
          onClose={() => setAddingTrack(null)}
          onChanged={loadPlaylists}
        />
      )}
    </div>
  );
}
