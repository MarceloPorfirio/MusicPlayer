import { useState, type FormEvent } from 'react';
import { api, type ImportResult } from '../api';
import { useOffline } from '../offline';
import { SearchResults } from './SearchResults';

function describeResult(result: ImportResult) {
  if (result.kind === 'queued') return 'Na fila: o seu PC vai buscar esta URL e baixar as músicas.';
  if (result.kind === 'track') return null;
  const parts = [`${result.added} nova${result.added === 1 ? '' : 's'}`];
  if (result.existing) parts.push(`${result.existing} já na biblioteca`);
  if (result.skipped)
    parts.push(`${result.skipped} indisponíve${result.skipped === 1 ? 'l' : 'is'}`);
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

const isUrl = (text: string) => /^https?:\/\//i.test(text) && URL.canParse(text);

export function AddTrackForm({ onAdded }: { onAdded: () => void }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [choice, setChoice] = useState<{ video: string; playlist: string } | null>(null);
  const [query, setQuery] = useState<string | null>(null);
  // Muda a cada envio: buscar o mesmo texto de novo refaz a busca.
  const [searchKey, setSearchKey] = useState(0);
  const { online } = useOffline();
  const text = url.trim();

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
    if (!text) return;
    setError(null);
    setMessage(null);
    // Texto livre é busca; link é importação direta.
    if (!isUrl(text)) {
      setChoice(null);
      setQuery(text);
      setSearchKey((k) => k + 1);
      return;
    }
    setQuery(null);
    const playlist = playlistUrlOf(text);
    if (playlist) setChoice({ video: text, playlist });
    else void runImport(text);
  }

  return (
    <>
      <form className="add-form" onSubmit={submit}>
        <input
          type="search"
          enterKeyHint="search"
          placeholder={
            online
              ? 'Buscar no YouTube ou colar link…'
              : 'Sem conexão: não dá para buscar agora'
          }
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setChoice(null);
          }}
          disabled={busy || !online}
        />
        <button type="submit" className="btn primary" disabled={busy || !online || !text}>
          {busy ? 'Buscando…' : isUrl(text) ? 'Adicionar' : 'Buscar'}
        </button>
        {choice && (
          <div className="import-choice">
            <span>Este vídeo faz parte de uma playlist. O que adicionar?</span>
            <button type="button" className="btn" onClick={() => runImport(choice.video)}>
              Só esta música
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={() => runImport(choice.playlist)}
            >
              Playlist inteira
            </button>
          </div>
        )}
        {error && <p className="error">{error}</p>}
        {message && <p className="success">{message}</p>}
      </form>
      {query && (
        <SearchResults
          key={searchKey}
          query={query}
          onClose={() => setQuery(null)}
          onAdded={onAdded}
        />
      )}
    </>
  );
}
