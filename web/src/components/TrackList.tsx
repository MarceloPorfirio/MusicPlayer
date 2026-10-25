import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type Over,
} from '@dnd-kit/core';
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useState, type ReactNode } from 'react';
import { formatTime, type Track } from '../api';
import { useOffline } from '../offline';
import { usePlayer } from '../player';
import { Cover } from './Cover';
import { EditTrackDialog } from './EditTrackDialog';
import {
  DownloadIcon,
  DragIcon,
  EditIcon,
  MoreIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  QueueAddIcon,
  QueueNextIcon,
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
  /** Ativa arrastar para reordenar; recebe a lista na nova ordem. */
  onReorder?: (tracks: Track[]) => void;
}

export function TrackList({
  tracks,
  onAddToPlaylist,
  onEdited,
  onRemove,
  removeLabel,
  onRetry,
  onReorder,
}: Props) {
  const { current, updateTrack } = usePlayer();
  const offline = useOffline();
  const [editing, setEditing] = useState<Track | null>(null);
  const [menuFor, setMenuFor] = useState<Track | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (!tracks.length) return <p className="empty">Nenhuma música aqui ainda.</p>;

  const rowClass = (t: Track) =>
    [current?.id === t.id && 'active', t.status === 'ready' && !offline.canPlay(t) && 'unavailable']
      .filter(Boolean)
      .join(' ') || undefined;
  const rowProps = { tracks, rowClass, onRetry, onMenu: setMenuFor };

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
      {onReorder ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis, restrictToParentElement]}
          accessibility={{ announcements, screenReaderInstructions }}
          onDragEnd={({ active, over }) => {
            if (!over || active.id === over.id) return;
            const from = tracks.findIndex((t) => t.id === active.id);
            const to = tracks.findIndex((t) => t.id === over.id);
            onReorder(arrayMove(tracks, from, to));
          }}
        >
          <SortableContext items={tracks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            <ul className="track-list">
              {tracks.map((t) => (
                <SortableRow key={t.id} track={t} {...rowProps} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      ) : (
        <ul className="track-list">
          {tracks.map((t) => (
            <li key={t.id} className={rowClass(t)}>
              <RowBody track={t} {...rowProps} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// Avisos de leitor de tela do arrastar, em português.
const screenReaderInstructions = {
  draggable:
    'Para reordenar, pressione espaço ou enter, use as setas para mover e espaço ou enter para soltar. Esc cancela.',
};
const position = (over: Over | null) => {
  const index = over?.data.current?.sortable?.index;
  return typeof index === 'number' ? `posição ${index + 1}` : 'fora da lista';
};
const announcements: Announcements = {
  onDragStart: () => 'Música selecionada para mover.',
  onDragOver: ({ over }) => `Movendo para a ${position(over)}.`,
  onDragEnd: ({ over }) => `Música solta na ${position(over)}.`,
  onDragCancel: () => 'Movimento cancelado.',
};

interface RowProps {
  track: Track;
  tracks: Track[];
  rowClass: (track: Track) => string | undefined;
  onRetry?: (track: Track) => void;
  onMenu: (track: Track) => void;
}

function SortableRow({ track, rowClass, ...rest }: RowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: track.id });
  return (
    <li
      ref={setNodeRef}
      className={[rowClass(track), isDragging && 'dragging'].filter(Boolean).join(' ') || undefined}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button
        ref={setActivatorNodeRef}
        className="icon-btn drag-handle"
        aria-label={`Arrastar "${track.title}"`}
        {...attributes}
        {...listeners}
      >
        <DragIcon />
      </button>
      <RowBody track={track} rowClass={rowClass} {...rest} />
    </li>
  );
}

function RowBody({ track: t, tracks, onRetry, onMenu }: RowProps) {
  const { current, playing, playTracks, toggle } = usePlayer();
  const offline = useOffline();
  const playable = offline.canPlay(t);
  const isCurrent = current?.id === t.id;

  let subtitle: ReactNode;
  switch (t.status) {
    case 'pending':
      subtitle = 'Na fila…';
      break;
    case 'downloading':
      subtitle = `Baixando ${Math.round(t.progress ?? 0)}%`;
      break;
    case 'error':
      subtitle = <span className="error">Falhou: {t.error}</span>;
      break;
    default:
      subtitle = (
        <>
          {offline.saved.has(t.id) && <SavedIcon className="saved-icon" aria-label="No aparelho" />}
          {offline.saving.has(t.id) && 'Salvando no aparelho… '}
          {t.artist ?? 'Artista desconhecido'}
        </>
      );
  }

  return (
    <>
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
          <span className="track-sub">{subtitle}</span>
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
        <button className="icon-btn" title="Mais opções" onClick={() => onMenu(t)}>
          <MoreIcon />
        </button>
      </div>
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
  const player = usePlayer();
  const ready = track.status === 'ready';
  const saved = offline.saved.has(track.id);
  const playable = offline.canPlay(track);

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
          {playable && (
            <>
              <li>
                <button onClick={pick(() => player.playNext(track))}>
                  <QueueNextIcon /> Tocar a seguir
                </button>
              </li>
              <li>
                <button onClick={pick(() => player.addToQueue(track))}>
                  <QueueAddIcon /> Adicionar à fila
                </button>
              </li>
            </>
          )}
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
