import { useEffect, useState } from 'react';
import { api, formatTime, type Search } from '../api';
import { CloseIcon, PlusIcon, SavedIcon } from './icons';

const POLL_MS = 700;
// No modo worker a busca roda no PC; sem resposta nisso, ele provavelmente está desligado.
const TIMEOUT_MS = 30_000;

interface Props {
  query: string;
  onClose: () => void;
  onAdded: () => void;
}

export function SearchResults({ query, onClose, onAdded }: Props) {
  const [search, setSearch] = useState<Search | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setSearch(null);
    setError(null);
    (async () => {
      try {
        let s = await api.search(query);
        const deadline = Date.now() + TIMEOUT_MS;
        while (!cancelled && (s.status === 'pending' || s.status === 'processing')) {
          if (Date.now() > deadline) {
            throw new Error('O PC não respondeu. Confira se o worker está ligado e atualizado.');
          }
          await new Promise((r) => setTimeout(r, POLL_MS));
          s = await api.getSearch(s.id);
        }
        if (cancelled) return;
        if (s.status === 'error') throw new Error(s.error ?? 'A busca falhou.');
        setSearch(s);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [query]);

  async function add(videoId: string) {
    if (!search) return;
    try {
      await api.addSearchResult(search.id, videoId);
      setAdded((s) => new Set(s).add(videoId));
      onAdded();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <section className="search-results" aria-label={`Resultados para ${query}`}>
      <header>
        <span className="track-sub">
          {search ? `Resultados para "${query}"` : error ? 'Busca' : `Buscando "${query}"…`}
        </span>
        <button className="icon-btn" title="Fechar resultados" onClick={onClose}>
          <CloseIcon />
        </button>
      </header>
      {error && <p className="error">{error}</p>}
      {search && !search.results.length && <p className="empty">Nada encontrado.</p>}
      <ul className="track-list">
        {search?.results.map((r) => {
          const have = r.inLibrary || added.has(r.id);
          return (
            <li key={r.id}>
              <div className="track-main">
                <img
                  className="result-thumb"
                  src={`https://i.ytimg.com/vi/${r.id}/mqdefault.jpg`}
                  alt=""
                  loading="lazy"
                />
                <span className="track-text">
                  <span className="track-title">{r.title}</span>
                  <span className="track-sub">
                    {[r.channel, r.duration && formatTime(r.duration)].filter(Boolean).join(' · ')}
                  </span>
                </span>
              </div>
              <div className="track-actions">
                {have ? (
                  <span
                    className="in-library"
                    title={r.inLibrary ? 'Já está na biblioteca' : 'Adicionada'}
                  >
                    <SavedIcon />
                  </span>
                ) : (
                  <button
                    className="icon-btn"
                    title="Adicionar à biblioteca"
                    onClick={() => add(r.id)}
                  >
                    <PlusIcon />
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
