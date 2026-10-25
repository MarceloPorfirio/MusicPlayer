import { api, type ImportJob, type ServerStatus } from '../api';
import { CloseIcon, RetryIcon } from './icons';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Aviso do worker (só no modo worker e quando há algo esperando). */
export function WorkerStatus({ status }: { status: ServerStatus | null }) {
  if (status?.downloadMode !== 'worker') return null;
  const { tracks, imports } = status.waiting;
  if (!tracks && !imports) return null;

  const parts = [];
  if (tracks) parts.push(plural(tracks, 'música', 'músicas'));
  if (imports) parts.push(plural(imports, 'URL', 'URLs'));
  const what = parts.join(' e ');

  return status.worker.online ? (
    <div className="worker-status online">
      <span className="dot" aria-hidden />
      PC conectado: baixando {what}.
    </div>
  ) : (
    <div className="worker-status">
      <span className="dot" aria-hidden />
      PC desconectado: {what} aguardando. Ligue o PC com o worker para baixar.
    </div>
  );
}

const STATUS_LABEL = { pending: 'Aguardando o PC…', processing: 'Buscando…' } as const;

/** URLs coladas que o PC ainda vai buscar (ou que falharam). */
export function ImportList({ imports, onChanged }: { imports: ImportJob[]; onChanged: () => void }) {
  if (!imports.length) return null;
  return (
    <ul className="import-list">
      {imports.map((job) => (
        <li key={job.id}>
          <span className="track-text">
            <span className="track-title">{job.url}</span>
            <span className="track-sub">
              {job.status === 'error' ? (
                <span className="error">Falhou: {job.error}</span>
              ) : (
                STATUS_LABEL[job.status]
              )}
            </span>
          </span>
          {job.status === 'error' && (
            <button
              className="icon-btn"
              title="Tentar de novo"
              onClick={() => api.retryImport(job.id).then(onChanged)}
            >
              <RetryIcon />
            </button>
          )}
          <button
            className="icon-btn"
            title="Remover"
            onClick={() => api.deleteImport(job.id).then(onChanged)}
          >
            <CloseIcon />
          </button>
        </li>
      ))}
    </ul>
  );
}
