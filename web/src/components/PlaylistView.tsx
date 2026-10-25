import { useCallback, useEffect, useState } from 'react';
import { api, type Playlist } from '../api';
import { ListActions } from './ListActions';
import { TrackList } from './TrackList';

interface Props {
  id: number;
  onBack: () => void;
  onChanged: () => void;
}

export function PlaylistView({ id, onBack, onChanged }: Props) {
  const [playlist, setPlaylist] = useState<Playlist | null>(null);

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
    if (!confirm(`Apagar a playlist "${playlist!.name}"? As músicas continuam na biblioteca.`))
      return;
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
        <ListActions tracks={playlist.tracks}>
          <button className="btn" onClick={rename}>
            Renomear
          </button>
          <button className="btn danger" onClick={remove}>
            Apagar
          </button>
        </ListActions>
      </div>
      <TrackList
        tracks={playlist.tracks}
        removeLabel="Remover da playlist"
        onReorder={async (tracks) => {
          setPlaylist({ ...playlist, tracks }); // otimista: a lista já aparece na nova ordem
          try {
            await api.reorderPlaylist(
              id,
              tracks.map((t) => t.id),
            );
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
