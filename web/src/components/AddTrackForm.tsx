import { useState, type FormEvent } from 'react';
import { api } from '../api';

export function AddTrackForm({ onAdded }: { onAdded: () => void }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.addTrack(url);
      setUrl('');
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
        placeholder="Cole a URL do YouTube…"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        disabled={busy}
      />
      <button type="submit" className="btn primary" disabled={busy || !url.trim()}>
        {busy ? 'Buscando…' : 'Adicionar'}
      </button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}
