import { useCallback, useEffect, useState } from 'react';
import { api, type SmartKind, type SmartList } from '../api';
import { FAVORITES_CHANGED, setFavorite } from '../history';
import { usePlayer } from '../player';
import { ListActions } from './ListActions';
import { TrackList } from './TrackList';

const EMPTY: Record<SmartKind, string> = {
  favorites: 'Toque no coração de uma música para ela aparecer aqui.',
  recent: 'As músicas que você ouvir aparecem aqui.',
  top: 'As músicas que você mais ouvir aparecem aqui.',
};

interface Props {
  kind: SmartKind;
  onBack: () => void;
  onAddToPlaylist: Parameters<typeof TrackList>[0]['onAddToPlaylist'];
}

/** Favoritas, Tocadas recentemente e Mais tocadas: listas montadas pelo servidor, sem edição. */
export function SmartListView({ kind, onBack, onAddToPlaylist }: Props) {
  const [list, setList] = useState<SmartList | null>(null);
  const { updateTrack } = usePlayer();

  const load = useCallback(() => api.smartList(kind).then(setList), [kind]);
  useEffect(() => {
    void load();
    window.addEventListener(FAVORITES_CHANGED, load);
    return () => window.removeEventListener(FAVORITES_CHANGED, load);
  }, [load]);

  if (!list) return <p className="empty">Carregando…</p>;

  return (
    <>
      <div className="playlist-header">
        <button className="btn" onClick={onBack}>
          ← Voltar
        </button>
        <h2>{list.name}</h2>
        {list.tracks.length > 0 && <ListActions tracks={list.tracks} />}
      </div>
      {list.tracks.length ? (
        <TrackList
          tracks={list.tracks}
          onAddToPlaylist={onAddToPlaylist}
          onEdited={load}
          {...(kind === 'favorites' && {
            removeLabel: 'Remover das favoritas',
            onRemove: (t) => setFavorite(t, false).then(updateTrack),
          })}
        />
      ) : (
        <p className="empty">{EMPTY[kind]}</p>
      )}
    </>
  );
}
