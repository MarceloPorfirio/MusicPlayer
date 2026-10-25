import { useCallback, useEffect, useState } from 'react';
import { api, type Playlist } from '../api';
import { useOffline } from '../offline';
import { usePlayer } from '../player';
import { TrackList } from './TrackList';
import { DownloadIcon, PlayIcon, ShuffleIcon } from './icons';

interface Props {
  id: number;
  onBack: () => void;
  onChanged: () => void;
}

export function PlaylistView({ id, onBack, onChanged }: Props) {
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const { playTracks } = usePlayer();
  const offline = useOffline();

  const load = useCallback(() => api.playlist(id).then(setPlaylist), [id]);
  useEffect(() => void load(), [load]);

  if (!playlist) return <p className="empty">Carregando…</p>;

  const ready = playlist.tracks.filter((t) => t.status === 'ready');
  const savedCount = ready.filter((t) => offline.saved.has(t.id)).length;
  const savingCount = ready.filter((t) => offline.saving.has(t.id)).length;
  const allSaved = ready.length > 0 && savedCount === ready.length;
  const canPlayAny = playlist.tracks.some(offline.canPlay);

  async function rename() {
    const name = prompt('Novo nome da playlist', playlist!.name)?.trim();
    if (!name) return;
    await api.renamePlaylist(id, name);
    await load();
    onChanged();
  }

  async function remove() {
    if (!confirm(`Apagar a playlist "${playlist!.name}"? As músicas continuam na biblioteca.`)) return;
    await api.deletePlaylist(id);
    onChanged();
    onBack();
  }

  return (
    <>
      <div className="playlist-header">
        <button className="btn" onClick={onBack}>
          ← Voltar
        </button>
        <h2>{playlist.name}</h2>
        <div className="playlist-actions">
          <button
            className="btn primary"
            disabled={!canPlayAny}
            onClick={() => playTracks(playlist.tracks)}
          >
            <PlayIcon width={18} height={18} /> Tocar
          </button>
          <button
            className="btn"
            disabled={!canPlayAny}
            onClick={() => playTracks(playlist.tracks, undefined, true)}
          >
            <ShuffleIcon width={18} height={18} /> Aleatório
          </button>
          {allSaved ? (
            <button
              className="btn"
              onClick={() => {
                if (confirm('Remover as músicas desta playlist do aparelho?')) void offline.remove(ready);
              }}
            >
              <DownloadIcon width={18} height={18} /> No aparelho ✓
            </button>
          ) : (
            <button
              className="btn"
              disabled={!ready.length || !offline.online || savingCount > 0}
              onClick={() => void offline.save(ready)}
            >
              <DownloadIcon width={18} height={18} />
              {savingCount > 0
                ? `Baixando ${savedCount}/${ready.length}…`
                : savedCount > 0
                  ? `Baixar restantes (${savedCount}/${ready.length})`
                  : 'Baixar no aparelho'}
            </button>
          )}
          <button className="btn" onClick={rename}>
            Renomear
          </button>
          <button className="btn danger" onClick={remove}>
            Apagar
          </button>
        </div>
      </div>
      <TrackList
        tracks={playlist.tracks}
        removeLabel="Remover da playlist"
        onReorder={async (tracks) => {
          setPlaylist({ ...playlist, tracks }); // otimista: a lista já aparece na nova ordem
          try {
            await api.reorderPlaylist(id, tracks.map((t) => t.id));
          } catch (err) {
            alert((err as Error).message);
            await load();
          }
        }}
        onEdited={() => {
          void load();
          onChanged();
        }}
        onRemove={async (t) => {
          await api.removeFromPlaylist(id, t.id);
          await load();
          onChanged();
        }}
      />
    </>
  );
}
