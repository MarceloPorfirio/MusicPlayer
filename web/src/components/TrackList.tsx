import { formatTime, type Track } from '../api';
import { usePlayer } from '../player';
import { Cover } from './Cover';
import { PauseIcon, PlayIcon, PlusIcon, RetryIcon, TrashIcon } from './icons';

interface Props {
  tracks: Track[];
  onAddToPlaylist?: (track: Track) => void;
  onRemove: (track: Track) => void;
  removeLabel: string;
  onRetry?: (track: Track) => void;
}

export function TrackList({ tracks, onAddToPlaylist, onRemove, removeLabel, onRetry }: Props) {
  const { current, playing, playTracks, toggle } = usePlayer();

  if (!tracks.length) return <p className="empty">Nenhuma música aqui ainda.</p>;

  return (
    <ul className="track-list">
      {tracks.map((t) => {
        const ready = t.status === 'ready';
        const isCurrent = current?.id === t.id;
        return (
          <li key={t.id} className={isCurrent ? 'active' : undefined}>
            <button
              className="track-main"
              disabled={!ready}
              title={ready ? 'Tocar' : undefined}
              onClick={() => (isCurrent ? toggle() : playTracks(tracks, t))}
            >
              <span className="cover-wrap">
                <Cover trackId={t.hasCover ? t.id : null} />
                {ready && (
                  <span className="cover-overlay">
                    {isCurrent && playing ? <PauseIcon /> : <PlayIcon />}
                  </span>
                )}
              </span>
              <span className="track-text">
                <span className="track-title">{t.title}</span>
                <span className="track-sub">
                  {t.status === 'ready' && (t.artist ?? 'Artista desconhecido')}
                  {t.status === 'pending' && 'Na fila…'}
                  {t.status === 'downloading' && `Baixando ${Math.round(t.progress ?? 0)}%`}
                  {t.status === 'error' && <span className="error">Falhou: {t.error}</span>}
                </span>
              </span>
              <span className="track-duration">{formatTime(t.duration)}</span>
            </button>
            {t.status === 'downloading' && (
              <progress className="track-progress" max={100} value={t.progress ?? 0} />
            )}
            <div className="track-actions">
              {t.status === 'error' && onRetry && (
                <button className="icon-btn" title="Tentar de novo" onClick={() => onRetry(t)}>
                  <RetryIcon />
                </button>
              )}
              {ready && onAddToPlaylist && (
                <button
                  className="icon-btn"
                  title="Adicionar à playlist"
                  onClick={() => onAddToPlaylist(t)}
                >
                  <PlusIcon />
                </button>
              )}
              <button className="icon-btn" title={removeLabel} onClick={() => onRemove(t)}>
                <TrashIcon />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
