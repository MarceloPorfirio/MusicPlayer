import { useState, type FormEvent } from 'react';
import { api, type ImportResult } from '../api';
import { useOffline } from '../offline';

function describeResult(result: ImportResult) {
  if (result.kind === 'queued') return 'Na fila: o seu PC vai buscar esta URL e baixar as músicas.';
  if (result.kind === 'track') return null;
  const parts = [`${result.added} nova${result.added === 1 ? '' : 's'}`];
  if (result.existing) parts.push(`${result.existing} já na biblioteca`);
  if (result.skipped) parts.push(`${result.skipped} indisponíve${result.skipped === 1 ? 'l' : 'is'}`);
  return `Playlist "${result.playlist.name}" importada: ${parts.join(', ')}.`;
}

/**
 * URL de vídeo aberto dentro de uma playlist (watch?v=...&list=...): devolve a URL da
 * playlist inteira. Mixes automáticos (list=RD...) não contam, são infinitos.
 */
function playlistUrlOf(raw: string): string | null {
  if (!URL.canParse(raw)) return null;
  const url = new URL(raw);
  if (!/(^|\.)(youtube\.com|youtu\.be)$/.test(url.hostname)) return null;
  const list = url.searchParams.get('list');
  const hasVideo = url.searchParams.has('v') || url.hostname.endsWith('youtu.be');
  if (!list || !hasVideo || list.startsWith('RD')) return null;
  return `https://${url.hostname.startsWith('music.') ? 'music' : 'www'}.youtube.com/playlist?list=${list}`;
}

export function AddTrackForm({ onAdded }: { onAdded: () => void }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [choice, setChoice] = useState<{ video: string; playlist: string } | null>(null);
  const { online } = useOffline();

  async function runImport(target: string) {
    setChoice(null);
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await api.importUrl(target);
      setUrl('');
      setMessage(describeResult(result));
      onAdded();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const target = url.trim();
    if (!target) return;
    const playlist = playlistUrlOf(target);
    if (playlist) setChoice({ video: target, playlist });
    else void runImport(target);
  }

  return (
    <form className="add-form" onSubmit={submit}>
      <input
        type="url"
        inputMode="url"
        placeholder={
          online ? 'URL de um vídeo ou playlist do YouTube…' : 'Sem conexão: não dá para adicionar agora'
        }
        value={url}
        onChange={(e) => {
          setUrl(e.target.value);
          setChoice(null);
        }}
        disabled={busy || !online}
      />
      <button type="submit" className="btn primary" disabled={busy || !online || !url.trim()}>
        {busy ? 'Buscando…' : 'Adicionar'}
      </button>
      {choice && (
        <div className="import-choice">
          <span>Este vídeo faz parte de uma playlist. O que adicionar?</span>
          <button type="button" className="btn" onClick={() => runImport(choice.video)}>
            Só esta música
          </button>
          <button type="button" className="btn primary" onClick={() => runImport(choice.playlist)}>
            Playlist inteira
          </button>
        </div>
      )}
      {error && <p className="error">{error}</p>}
      {message && <p className="success">{message}</p>}
    </form>
  );
}
