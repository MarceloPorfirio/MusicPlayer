import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { audioUrl, coverUrl, type Track } from './api';
import { OFFLINE_AUDIO_CACHE } from './cacheNames';

interface OfflineContextValue {
  /** Ids das faixas salvas no aparelho. */
  saved: Set<number>;
  /** Ids sendo baixadas agora. */
  saving: Set<number>;
  online: boolean;
  /** A faixa pode tocar agora (pronta no servidor e, sem rede, salva no aparelho). */
  canPlay: (track: Track) => boolean;
  save: (tracks: Track[]) => Promise<void>;
  remove: (tracks: Track[]) => Promise<void>;
  /** Apaga todos os áudios salvos no aparelho. */
  clearAll: () => Promise<void>;
  /** Espaço usado pelo app no aparelho (bytes) e o disponível, quando o navegador informa. */
  storage: { usage: number; quota: number } | null;
}

const OfflineContext = createContext<OfflineContextValue | null>(null);

export function useOffline() {
  const ctx = useContext(OfflineContext);
  if (!ctx) throw new Error('useOffline precisa estar dentro de <OfflineProvider>');
  return ctx;
}

const supported = typeof caches !== 'undefined';
const idFromUrl = (url: string) => Number(new URL(url).pathname.match(/\/tracks\/(\d+)\//)?.[1]);

export function OfflineProvider({ children }: { children: ReactNode }) {
  const [saved, setSaved] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState<Set<number>>(new Set());
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    if (supported) {
      caches
        .open(OFFLINE_AUDIO_CACHE)
        .then((cache) => cache.keys())
        .then((keys) => setSaved(new Set(keys.map((r) => idFromUrl(r.url)))));
    }
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  const save = useCallback(async (tracks: Track[]) => {
    if (!supported) return;
    const cache = await caches.open(OFFLINE_AUDIO_CACHE);
    // Pede ao navegador para não apagar os downloads quando faltar espaço.
    void navigator.storage?.persist?.();
    for (const track of tracks.filter((t) => t.status === 'ready')) {
      if (await cache.match(audioUrl(track.id))) continue;
      setSaving((s) => new Set(s).add(track.id));
      try {
        const res = await fetch(audioUrl(track.id));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await cache.put(audioUrl(track.id), res);
        if (track.hasCover) void fetch(coverUrl(track.id)); // o SW guarda a capa
        setSaved((s) => new Set(s).add(track.id));
      } catch (err) {
        console.warn(`Falha ao salvar "${track.title}"`, err);
      } finally {
        setSaving((s) => {
          const next = new Set(s);
          next.delete(track.id);
          return next;
        });
      }
    }
  }, []);

  const remove = useCallback(async (tracks: Track[]) => {
    if (!supported) return;
    const cache = await caches.open(OFFLINE_AUDIO_CACHE);
    await Promise.all(tracks.map((t) => cache.delete(audioUrl(t.id))));
    setSaved((s) => {
      const next = new Set(s);
      tracks.forEach((t) => next.delete(t.id));
      return next;
    });
  }, []);

  const clearAll = useCallback(async () => {
    if (!supported) return;
    await caches.delete(OFFLINE_AUDIO_CACHE);
    setSaved(new Set());
  }, []);

  // Recalcula o espaço usado sempre que o conjunto de faixas salvas muda.
  const [storage, setStorage] = useState<OfflineContextValue['storage']>(null);
  useEffect(() => {
    navigator.storage
      ?.estimate?.()
      .then(({ usage, quota }) => setStorage({ usage: usage ?? 0, quota: quota ?? 0 }))
      .catch(() => setStorage(null));
  }, [saved]);

  const canPlay = useCallback(
    (track: Track) => track.status === 'ready' && (online || saved.has(track.id)),
    [online, saved],
  );

  const value = useMemo(
    () => ({ saved, saving, online, canPlay, save, remove, clearAll, storage }),
    [saved, saving, online, canPlay, save, remove, clearAll, storage],
  );
  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}
