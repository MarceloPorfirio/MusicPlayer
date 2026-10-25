import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  api,
  type ImportJob,
  type PlaylistSummary,
  type ServerStatus,
  type SmartKind,
  type SmartSummary,
  type Track,
} from './api';
import { ArtistView, ArtistsGrid, groupByArtist } from './components/Artists';
import { SmartListView } from './components/SmartListView';
import { FAVORITES_CHANGED } from './history';
import { AddToPlaylistDialog } from './components/AddToPlaylistDialog';
import { BottomNav, type Tab } from './components/BottomNav';
import { SearchView } from './components/SearchView';
import { StatusContext } from './status';
import { useAppUpdate } from './update';
import { PlayerBar } from './components/PlayerBar';
import { PlaylistView } from './components/PlaylistView';
import { PlaylistsView } from './components/PlaylistsView';
import { TrackList } from './components/TrackList';
import { FilterIcon, PlayIcon, ShuffleIcon } from './components/icons';
import { useOffline } from './offline';
import { usePlayer } from './player';

type View =
  | { kind: 'search' }
  | { kind: 'library' }
  | { kind: 'playlists' }
  | { kind: 'playlist'; id: number }
  | { kind: 'smart'; smart: SmartKind }
  | { kind: 'artist'; key: string };

type LibraryMode = 'songs' | 'artists';
const LIBRARY_MODE_KEY = 'library-mode';

function savedLibraryMode(): LibraryMode {
  try {
    return localStorage.getItem(LIBRARY_MODE_KEY) === 'artists' ? 'artists' : 'songs';
  } catch {
    return 'songs';
  }
}

export function App({ onLogout }: { onLogout?: () => void }) {
  const [view, setView] = useState<View>({ kind: 'library' });
  const [tracks, setTracks] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<PlaylistSummary[]>([]);
  const [addingTrack, setAddingTrack] = useState<Track | null>(null);
  const [query, setQuery] = useState('');
  const [libraryMode, setLibraryMode] = useState<LibraryMode>(savedLibraryMode);
  const changeLibraryMode = (mode: LibraryMode) => {
    setLibraryMode(mode);
    setQuery('');
    try {
      localStorage.setItem(LIBRARY_MODE_KEY, mode);
    } catch {
      // só não lembra na próxima vez
    }
  };
  const { playTracks, forget, playing } = usePlayer();
  const updatePending = useAppUpdate(playing);
  const offline = useOffline();

  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [imports, setImports] = useState<ImportJob[]>([]);
  const importsCount = useRef(0);

  const [smart, setSmart] = useState<SmartSummary[]>([]);
  // Playlists e os cartões das listas automáticas (que mudam a cada música ouvida).
  const loadPlaylists = useCallback(
    () =>
      Promise.all([
        api.playlists().then(setPlaylists),
        api
          .smartLists()
          .then(setSmart)
          .catch(() => {}),
      ]),
    [],
  );
  useEffect(() => {
    if (view.kind === 'playlists') void loadPlaylists();
  }, [view.kind, loadPlaylists]);
  /** Biblioteca + URLs aguardando o PC + status do worker. */
  const loadTracks = useCallback(async () => {
    const [t, i, s] = await Promise.all([
      api.tracks(),
      api.imports().catch(() => []),
      api.status().catch(() => null),
    ]);
    setTracks(t);
    setImports(i);
    setStatus(s);
    // Uma URL processada pelo PC pode ter virado playlist nova.
    if (i.length < importsCount.current) void loadPlaylists();
    importsCount.current = i.length;
  }, [loadPlaylists]);

  useEffect(() => {
    void loadTracks();
    void loadPlaylists();
    // Curtir/descurtir em qualquer tela atualiza a biblioteca e o cartão de Favoritas.
    const onFavorites = () => void Promise.all([loadTracks(), loadPlaylists()]);
    window.addEventListener(FAVORITES_CHANGED, onFavorites);
    return () => window.removeEventListener(FAVORITES_CHANGED, onFavorites);
  }, [loadTracks, loadPlaylists]);

  // Enquanto houver downloads ou URLs em andamento, atualiza a lista periodicamente:
  // a cada segundo com o PC baixando (a barra anda), a cada 3 s esperando o PC ligar
  // (para perceber logo que ele voltou, sem precisar recarregar a página).
  const busy =
    tracks.some((t) => t.status === 'pending' || t.status === 'downloading') ||
    imports.some((i) => i.status !== 'error');
  const waitingForPc = status?.downloadMode === 'worker' && !status.worker.online;
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(loadTracks, waitingForPc ? 3000 : 1000);
    return () => clearInterval(timer);
  }, [busy, waitingForPc, loadTracks]);

  // Voltando para o app (celular desbloqueado, outra aba): atualiza na hora.
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && void loadTracks();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [loadTracks]);

  const q = query.trim().toLowerCase();
  // Biblioteca = o que já dá para ouvir. O que está na fila, baixando ou com erro fica na aba Buscar.
  const libraryTracks = useMemo(() => tracks.filter((t) => t.status === 'ready'), [tracks]);
  const artists = useMemo(() => groupByArtist(libraryTracks), [libraryTracks]);
  const visibleTracks = q
    ? libraryTracks.filter((t) =>
        `${t.title} ${t.artist ?? ''} ${t.album ?? ''}`.toLowerCase().includes(q),
      )
    : libraryTracks;
  const tab: Tab =
    view.kind === 'search'
      ? 'search'
      : view.kind === 'library' || view.kind === 'artist'
        ? 'library'
        : 'playlists';

  const reloadAll = () => void Promise.all([loadTracks(), loadPlaylists()]);
  const retryTrack = async (t: Track) => {
    await api.retryTrack(t.id);
    await loadTracks();
  };
  const deleteTrack = async (t: Track) => {
    if (!confirm(`Apagar "${t.title}" da biblioteca e de todas as playlists?`)) return;
    try {
      await api.deleteTrack(t.id);
      forget(t.id);
      await offline.remove([t]);
    } catch (err) {
      alert((err as Error).message);
    }
    await Promise.all([loadTracks(), loadPlaylists()]);
  };

  return (
    <StatusContext.Provider value={status}>
      <div className="app">
        <header className="top-bar">
          <h1>Pulse</h1>
          {onLogout && (
            <button className="btn" onClick={onLogout}>
              Sair
            </button>
          )}
        </header>

        {!offline.online && (
          <div className="offline-banner">
            Sem conexão: tocando só as músicas baixadas no aparelho.
          </div>
        )}
        {updatePending && (
          <div className="offline-banner update-banner">
            Nova versão disponível.
            <button className="btn primary" onClick={() => window.location.reload()}>
              Atualizar
            </button>
          </div>
        )}

        <main className="content">
          {view.kind === 'search' && (
            <SearchView
              tracks={tracks}
              imports={imports}
              status={status}
              onAdded={reloadAll}
              onImportsChanged={loadTracks}
              onAddToPlaylist={setAddingTrack}
              onEdited={reloadAll}
              onRetry={retryTrack}
              onRemove={deleteTrack}
            />
          )}

          {view.kind === 'library' && (
            <>
              {!libraryTracks.length && (
                <div className="empty">
                  <p>Sua biblioteca está vazia.</p>
                  <button className="btn primary" onClick={() => setView({ kind: 'search' })}>
                    Buscar músicas
                  </button>
                </div>
              )}
              {libraryTracks.length > 0 && (
                <div className="segmented" role="tablist">
                  <button
                    role="tab"
                    aria-selected={libraryMode === 'songs'}
                    className={libraryMode === 'songs' ? 'active' : undefined}
                    onClick={() => changeLibraryMode('songs')}
                  >
                    Músicas
                  </button>
                  <button
                    role="tab"
                    aria-selected={libraryMode === 'artists'}
                    className={libraryMode === 'artists' ? 'active' : undefined}
                    onClick={() => changeLibraryMode('artists')}
                  >
                    Artistas
                  </button>
                </div>
              )}
              {libraryTracks.length > 5 && (
                <div className="filter-field">
                  <FilterIcon width={18} height={18} aria-hidden />
                  <input
                    type="search"
                    placeholder={
                      libraryMode === 'artists' ? 'Filtrar artistas…' : 'Filtrar na biblioteca…'
                    }
                    aria-label="Filtrar na biblioteca"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
              )}
              {libraryMode === 'artists' && (
                <ArtistsGrid
                  artists={artists.filter((a) => !q || a.name.toLowerCase().includes(q))}
                  onOpen={(key) => setView({ kind: 'artist', key })}
                />
              )}
              {libraryMode === 'songs' && visibleTracks.some(offline.canPlay) && (
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
              {libraryMode === 'songs' && libraryTracks.length > 0 && (
                <TrackList
                  tracks={visibleTracks}
                  onAddToPlaylist={setAddingTrack}
                  onEdited={reloadAll}
                  removeLabel="Apagar da biblioteca"
                  onRemove={deleteTrack}
                />
              )}
            </>
          )}

          {view.kind === 'artist' && (
            <ArtistView
              artist={artists.find((a) => a.key === view.key)}
              onBack={() => setView({ kind: 'library' })}
              onAddToPlaylist={setAddingTrack}
              onEdited={() => void Promise.all([loadTracks(), loadPlaylists()])}
            />
          )}

          {view.kind === 'playlists' && (
            <PlaylistsView
              playlists={playlists}
              smart={smart}
              onOpen={(id) => setView({ kind: 'playlist', id })}
              onOpenSmart={(kind) => setView({ kind: 'smart', smart: kind })}
              onChanged={loadPlaylists}
            />
          )}

          {view.kind === 'smart' && (
            <SmartListView
              kind={view.smart}
              onBack={() => setView({ kind: 'playlists' })}
              onAddToPlaylist={setAddingTrack}
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
        <BottomNav
          tab={tab}
          // Pontinho na aba Buscar com download em andamento.
          searchBadge={busy}
          onSelect={(t) => {
            setQuery('');
            setView({ kind: t });
          }}
        />

        {addingTrack && (
          <AddToPlaylistDialog
            track={addingTrack}
            playlists={playlists}
            onClose={() => setAddingTrack(null)}
            onChanged={loadPlaylists}
          />
        )}
      </div>
    </StatusContext.Provider>
  );
}
