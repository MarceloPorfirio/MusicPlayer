import type { ImportJob, ServerStatus, Track } from '../api';
import { AddTrackForm } from './AddTrackForm';
import { TrackList } from './TrackList';
import { ImportList, WorkerStatus } from './WorkerStatus';

const RECENT_LIMIT = 20;

interface Props {
  tracks: Track[];
  imports: ImportJob[];
  status: ServerStatus | null;
  onAdded: () => void;
  onImportsChanged: () => void;
  onAddToPlaylist: (track: Track) => void;
  onEdited: () => void;
  onRetry: (track: Track) => void;
  onRemove: (track: Track) => void;
}

/** Aba Buscar: trazer música nova (YouTube ou link) e acompanhar os downloads. */
export function SearchView({
  tracks,
  imports,
  status,
  onAdded,
  onImportsChanged,
  onAddToPlaylist,
  onEdited,
  onRetry,
  onRemove,
}: Props) {
  // A API já devolve as faixas da mais nova para a mais antiga.
  const inProgress = tracks.filter((t) => t.status !== 'ready');
  const recent = tracks.filter((t) => t.status === 'ready').slice(0, RECENT_LIMIT);
  const listProps = {
    onAddToPlaylist,
    onEdited,
    onRetry,
    onRemove,
    removeLabel: 'Apagar da biblioteca',
  };

  return (
    <>
      <AddTrackForm onAdded={onAdded} />
      <WorkerStatus status={status} />
      <ImportList imports={imports} onChanged={onImportsChanged} />

      {inProgress.length > 0 && (
        <>
          <h3 className="section-title">Baixando agora</h3>
          <TrackList tracks={inProgress} {...listProps} />
        </>
      )}

      {recent.length > 0 && (
        <>
          <h3 className="section-title">Adicionadas recentemente</h3>
          <TrackList tracks={recent} {...listProps} />
        </>
      )}

      {!tracks.length && !imports.length && (
        <p className="empty">
          Busque pelo nome da música ou artista, ou cole o link de um vídeo ou playlist do YouTube.
        </p>
      )}
    </>
  );
}
