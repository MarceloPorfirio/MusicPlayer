import { useState } from 'react';
import { formatTime, type Track } from '../api';
import { useOffline } from '../offline';
import { usePlayer } from '../player';
import { Cover } from './Cover';
import { EditTrackDialog } from './EditTrackDialog';
import {
  DownloadIcon,
  EditIcon,
  MoreIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  RetryIcon,
  SavedIcon,
  TrashIcon,
} from './icons';

interface Props {
  tracks: Track[];
  onAddToPlaylist?: (track: Track) => void;
  /** Mostra a opção de editar; chamado depois de salvar. */
  onEdited?: () => void;
  onRemove: (track: Track) => void;
  removeLabel: string;
  onRetry?: (track: Track) => void;
}

export function TrackList({
  tracks,
  onAddToPlaylist,
  onEdited,
  onRemove,
  removeLabel,
  onRetry,
}: Props) {
  const { current, playing, playTracks, toggle, updateTrack } = usePlayer();
  const offline = useOffline();
  const [editing, setEditing] = useState<Track | null>(null);
  const [menuFor, setMenuFor] = useState<Track | null>(null);

  if (!tracks.length) return <p className="empty">Nenhuma música aqui ainda.</p>;

  function subtitle(t: Track) {
    switch (t.status) {
      case 'pending':
        return 'Na fila…';
      case 'downloading':
        return `Baixando ${Math.round(t.progress ?? 0)}%`;
      case 'error':
        return <span className="error">Falhou: {t.error}</span>;
      default:
        return (
          <>
            {offline.saved.has(t.id) && <SavedIcon className="saved-icon" aria-label="No aparelho" />}
            {offline.saving.has(t.id) && 'Salvando no aparelho… '}
            {t.artist ?? 'Artista desconhecido'}
          </>
        );
    }
  }

  return (
    <>
      {editing && (
        <EditTrackDialog
          track={editing}
          onClose={() => setEditing(null)}
          onSaved={(t) => {
            updateTrack(t);
            onEdited?.();
          }}
        />
      )}
      {menuFor && (
        <TrackMenu
          track={menuFor}
          onClose={() => setMenuFor(null)}
          onAddToPlaylist={onAddToPlaylist}
          onEdit={onEdited ? setEditing : undefined}
          onRemove={onRemove}
          removeLabel={removeLabel}
        />
      )}
      <ul className="track-list">
        {tracks.map((t) => {
          const playable = offline.canPlay(t);
          const isCurrent = current?.id === t.id;
          const classes = [isCurrent && 'active', t.status === 'ready' && !playable && 'unavailable'];
          return (
            <li key={t.id} className={classes.filter(Boolean).join(' ') || undefined}>
              <button
                className="track-main"
                disabled={!playable}
                title={playable ? 'Tocar' : undefined}
                onClick={() => (isCurrent ? toggle() : playTracks(tracks, t))}
              >
                <span className="cover-wrap">
                  <Cover trackId={t.hasCover ? t.id : null} />
                  {playable && (
                    <span className="cover-overlay">
                      {isCurrent && playing ? <PauseIcon /> : <PlayIcon />}
                    </span>
                  )}
                </span>
                <span className="track-text">
                  <span className="track-title">{t.title}</span>
                  <span className="track-sub">{subtitle(t)}</span>
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
                <button className="icon-btn" title="Mais opções" onClick={() => setMenuFor(t)}>
                  <MoreIcon />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

interface MenuProps {
  track: Track;
  onClose: () => void;
  onAddToPlaylist?: (track: Track) => void;
  onEdit?: (track: Track) => void;
  onRemove: (track: Track) => void;
  removeLabel: string;
}

function TrackMenu({ track, onClose, onAddToPlaylist, onEdit, onRemove, removeLabel }: MenuProps) {
  const offline = useOffline();
  const ready = track.status === 'ready';
  const saved = offline.saved.has(track.id);

  // Fecha o menu e executa a ação escolhida.
  const pick = (action: () => void) => () => {
    onClose();
    action();
  };

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" role="menu" onClick={(e) => e.stopPropagation()}>
        <div className="menu-header">
          <Cover trackId={track.hasCover ? track.id : null} />
          <span className="track-text">
            <span className="track-title">{track.title}</span>
            <span className="track-sub">{track.artist ?? 'Artista desconhecido'}</span>
          </span>
        </div>
        <ul className="menu-list">
          {ready && !saved && (
            <li>
              <button
                disabled={!offline.online || offline.saving.has(track.id)}
                onClick={pick(() => void offline.save([track]))}
              >
                <DownloadIcon /> Baixar no aparelho
              </button>
            </li>
          )}
          {saved && (
            <li>
              <button onClick={pick(() => void offline.remove([track]))}>
                <SavedIcon /> Remover do aparelho
              </button>
            </li>
          )}
          {ready && onAddToPlaylist && (
            <li>
              <button onClick={pick(() => onAddToPlaylist(track))}>
                <PlusIcon /> Adicionar à playlist
              </button>
            </li>
          )}
          {onEdit && (
            <li>
              <button onClick={pick(() => onEdit(track))}>
                <EditIcon /> Editar informações
              </button>
            </li>
          )}
          <li>
            <button className="danger" onClick={pick(() => onRemove(track))}>
              <TrashIcon /> {removeLabel}
            </button>
          </li>
        </ul>
      </div>
    </div>
  );
}
