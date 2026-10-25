import { useState } from 'react';
import type { Track } from '../api';
import { setFavorite } from '../history';
import { usePlayer } from '../player';
import { HeartIcon, HeartOutlineIcon } from './icons';

export function FavoriteButton({ track }: { track: Track }) {
  const { updateTrack } = usePlayer();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    try {
      updateTrack(await setFavorite(track, !track.favorite));
    } catch {
      // sem conexão: o coração simplesmente não muda
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      className={`icon-btn${track.favorite ? ' on' : ''}`}
      onClick={toggle}
      disabled={busy}
      aria-pressed={track.favorite}
      aria-label={track.favorite ? 'Remover das favoritas' : 'Curtir'}
      title={track.favorite ? 'Remover das favoritas' : 'Curtir'}
    >
      {track.favorite ? <HeartIcon /> : <HeartOutlineIcon />}
    </button>
  );
}
