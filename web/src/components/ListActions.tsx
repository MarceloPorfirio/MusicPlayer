import type { ReactNode } from 'react';
import type { Track } from '../api';
import { useOffline } from '../offline';
import { usePlayer } from '../player';
import { DownloadIcon, PlayIcon, ShuffleIcon } from './icons';

/** Tocar, aleatório e baixar no aparelho para uma lista de faixas (playlist ou lista automática). */
export function ListActions({ tracks, children }: { tracks: Track[]; children?: ReactNode }) {
  const { playTracks } = usePlayer();
  const offline = useOffline();

  const ready = tracks.filter((t) => t.status === 'ready');
  const savedCount = ready.filter((t) => offline.saved.has(t.id)).length;
  const savingCount = ready.filter((t) => offline.saving.has(t.id)).length;
  const allSaved = ready.length > 0 && savedCount === ready.length;
  const canPlayAny = tracks.some(offline.canPlay);

  return (
    <div className="playlist-actions">
      <button className="btn primary" disabled={!canPlayAny} onClick={() => playTracks(tracks)}>
        <PlayIcon width={18} height={18} /> Tocar
      </button>
      <button
        className="btn"
        disabled={!canPlayAny}
        onClick={() => playTracks(tracks, undefined, true)}
      >
        <ShuffleIcon width={18} height={18} /> Aleatório
      </button>
      {allSaved ? (
        <button
          className="btn"
          onClick={() => {
            if (confirm('Remover estas músicas do aparelho?')) void offline.remove(ready);
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
      {children}
    </div>
  );
}
