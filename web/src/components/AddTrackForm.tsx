import { useState, type FormEvent } from 'react';
import { api, type ImportResult } from '../api';

function describeResult(result: ImportResult) {
  if (result.kind === 'track') return null;
  const parts = [`${result.added} nova${result.added === 1 ? '' : 's'}`];
  if (result.existing) parts.push(`${result.existing} já na biblioteca`);
  if (result.skipped) parts.push(`${result.skipped} indisponíve${result.skipped === 1 ? 'l' : 'is'}`);
  return `Playlist "${result.playlist.name}" importada: ${parts.join(', ')}.`;
}

export function AddTrackForm({ onAdded }: { onAdded: () => void }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await api.importUrl(url);
      setUrl('');
      setMessage(describeResult(result));
      onAdded();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="add-form" onSubmit={submit}>
      <input
        type="url"
        inputMode="url"
        placeholder="URL de um vídeo ou playlist do YouTube…"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        disabled={busy}
      />
      <button type="submit" className="btn primary" disabled={busy || !url.trim()}>
        {busy ? 'Buscando…' : 'Adicionar'}
      </button>
      {error && <p className="error">{error}</p>}
      {message && <p className="success">{message}</p>}
    </form>
  );
}
