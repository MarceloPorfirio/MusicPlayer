import { useCallback, useEffect, useState } from 'react';
import { api, type Playlist } from '../api';
import { usePlayer } from '../player';
import { TrackList } from './TrackList';
import { PlayIcon } from './icons';

interface Props {
  id: number;
  onBack: () => void;
  onChanged: () => void;
}

export function PlaylistView({ id, onBack, onChanged }: Props) {
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const { playTracks } = usePlayer();

  const load = useCallback(() => api.playlist(id).then(setPlaylist), [id]);
  useEffect(() => void load(), [load]);

  if (!playlist) return <p className="empty">Carregando…</p>;

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
            disabled={!playlist.tracks.length}
            onClick={() => playTracks(playlist.tracks)}
          >
            <PlayIcon width={18} height={18} /> Tocar
          </button>
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
        onEdited={load}
        onRemove={async (t) => {
          await api.removeFromPlaylist(id, t.id);
          await load();
          onChanged();
        }}
      />
    </>
  );
}
