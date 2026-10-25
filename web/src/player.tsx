import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { audioUrl, coverUrl, type Track } from './api';
import { useOffline } from './offline';

export type RepeatMode = 'off' | 'all' | 'one';

interface PlayerContextValue {
  queue: Track[];
  index: number;
  current: Track | null;
  playing: boolean;
  time: number;
  duration: number;
  shuffle: boolean;
  repeat: RepeatMode;
  /** Toca a lista a partir de `start`. `shuffle` liga/desliga o aleatório (padrão: mantém o modo atual). */
  playTracks: (tracks: Track[], start?: Track, shuffle?: boolean) => void;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  seek: (seconds: number) => void;
  playAt: (index: number) => void;
  removeAt: (index: number) => void;
  playNext: (track: Track) => void;
  addToQueue: (track: Track) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  /** Atualiza metadados de uma faixa que já está na fila (após edição). */
  updateTrack: (track: Track) => void;
  /** Tira a faixa da fila (ex.: apagada da biblioteca); se tocava, segue para a próxima. */
  forget: (trackId: number) => void;
  /** Elemento <audio>, para o visualizador. */
  audioRef: RefObject<HTMLAudioElement | null>;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer precisa estar dentro de <PlayerProvider>');
  return ctx;
}

function shuffled<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Fila salva no aparelho para retomar depois que o celular fechar o app.
const STORAGE_KEY = 'player-state';
const TIME_KEY = 'player-time';

interface SavedState {
  queue: Track[];
  original: Track[];
  index: number;
  shuffle: boolean;
  repeat: RepeatMode;
}

function loadSaved(): (SavedState & { time: number }) | null {
  try {
    const state = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as SavedState | null;
    if (!state?.queue?.length) return null;
    return { ...state, time: Number(localStorage.getItem(TIME_KEY)) || 0 };
  } catch {
    return null;
  }
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [saved] = useState(loadSaved);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [queue, setQueue] = useState<Track[]>(saved?.queue ?? []);
  /** Ordem antes do aleatório, para voltar a ela ao desligar. */
  const [original, setOriginal] = useState<Track[]>(saved?.original ?? []);
  const [index, setIndex] = useState(saved?.index ?? -1);
  const [shuffle, setShuffle] = useState(saved?.shuffle ?? false);
  const [repeat, setRepeat] = useState<RepeatMode>(saved?.repeat ?? 'off');
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(saved?.time ?? 0);
  const [duration, setDuration] = useState(0);

  // Ao restaurar a fila, carrega a faixa parada na posição salva; nas demais trocas, toca.
  const autoplayRef = useRef(!saved);
  const pendingSeekRef = useRef(saved?.time ?? 0);
  const lastTimeSaveRef = useRef(0);

  const current = queue[index] ?? null;
  const { canPlay } = useOffline();

  const restart = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    audio.play().catch((err) => console.warn('Falha ao tocar:', err));
  }, []);

  const goTo = useCallback(
    (i: number) => {
      autoplayRef.current = true;
      if (i === index) restart();
      else setIndex(i);
    },
    [index, restart],
  );

  const playTracks = useCallback(
    (tracks: Track[], start?: Track, shuffleMode?: boolean) => {
      const ready = tracks.filter(canPlay);
      if (!ready.length) return;
      const useShuffle = shuffleMode ?? shuffle;
      const first = start && ready.find((t) => t.id === start.id);
      let next: Track[];
      let i = 0;
      if (useShuffle) {
        const head = first ?? ready[Math.floor(Math.random() * ready.length)];
        next = [head, ...shuffled(ready.filter((t) => t !== head))];
      } else {
        next = ready;
        i = first ? ready.indexOf(first) : 0;
      }
      setOriginal(ready);
      setShuffle(useShuffle);
      setQueue(next);
      autoplayRef.current = true;
      // Mesma faixa de novo: o efeito de troca não dispara, então recomeça aqui.
      if (current && next[i].id === current.id) {
        setIndex(i);
        restart();
      } else {
        setIndex(i);
      }
    },
    [canPlay, shuffle, current, restart],
  );

  const next = useCallback(() => {
    if (index + 1 < queue.length) goTo(index + 1);
    else if (repeat === 'all' && queue.length) goTo(0);
  }, [index, queue.length, repeat, goTo]);

  const prev = useCallback(() => {
    const audio = audioRef.current;
    if (audio && audio.currentTime > 3) audio.currentTime = 0;
    else if (index > 0) goTo(index - 1);
    else if (repeat === 'all' && queue.length) goTo(queue.length - 1);
    else if (audio) audio.currentTime = 0;
  }, [index, queue.length, repeat, goTo]);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio?.src) return;
    if (audio.paused) audio.play().catch((err) => console.warn('Falha ao tocar:', err));
    else audio.pause();
  }, []);

  const seek = useCallback((seconds: number) => {
    if (audioRef.current) audioRef.current.currentTime = seconds;
  }, []);

  const removeAt = useCallback(
    (i: number) => {
      if (i === index || i < 0 || i >= queue.length) return;
      const removed = queue[i];
      setQueue((q) => q.filter((_, j) => j !== i));
      setOriginal((o) => o.filter((t) => t.id !== removed.id));
      if (i < index) setIndex(index - 1);
    },
    [index, queue],
  );

  const insert = useCallback(
    (track: Track, position: 'next' | 'end') => {
      if (!canPlay(track)) return;
      if (!current) return playTracks([track], track, false);
      const at = position === 'next' ? index + 1 : queue.length;
      setQueue((q) => [...q.slice(0, at), track, ...q.slice(at)]);
      setOriginal((o) => {
        if (position === 'end') return [...o, track];
        const afterCurrent = o.findIndex((t) => t.id === current.id) + 1;
        return [...o.slice(0, afterCurrent), track, ...o.slice(afterCurrent)];
      });
    },
    [canPlay, current, index, queue.length, playTracks],
  );
  const playNext = useCallback((track: Track) => insert(track, 'next'), [insert]);
  const addToQueue = useCallback((track: Track) => insert(track, 'end'), [insert]);

  const toggleShuffle = useCallback(() => {
    if (!current) return setShuffle((s) => !s);
    if (shuffle) {
      // Volta à ordem original, continuando da faixa atual.
      const i = original.findIndex((t) => t.id === current.id);
      setQueue(original);
      setIndex(Math.max(0, i));
    } else {
      setOriginal(queue);
      setQueue([current, ...shuffled(queue.filter((_, j) => j !== index))]);
      setIndex(0);
    }
    setShuffle(!shuffle);
  }, [current, shuffle, original, queue, index]);

  const cycleRepeat = useCallback(() => {
    setRepeat((r) => (r === 'off' ? 'all' : r === 'all' ? 'one' : 'off'));
  }, []);

  const updateTrack = useCallback((track: Track) => {
    const swap = (list: Track[]) => list.map((t) => (t.id === track.id ? track : t));
    setQueue(swap);
    setOriginal(swap);
  }, []);

  const forget = useCallback(
    (trackId: number) => {
      if (!queue.some((t) => t.id === trackId)) return;
      const remaining = queue.filter((t) => t.id !== trackId);
      // Quantas faixas restantes vinham antes da atual: é o novo índice dela (ou da seguinte).
      const before = queue.slice(0, index).filter((t) => t.id !== trackId).length;
      setOriginal((o) => o.filter((t) => t.id !== trackId));
      setQueue(remaining);

      if (current?.id !== trackId) {
        setIndex(before);
        return;
      }
      const audio = audioRef.current;
      const wasPlaying = audio ? !audio.paused : false;
      audio?.pause();
      audio?.removeAttribute('src');
      audio?.load();
      if (before < remaining.length) {
        autoplayRef.current = wasPlaying;
        setIndex(before);
      } else {
        setIndex(remaining.length ? remaining.length - 1 : -1);
        autoplayRef.current = false;
      }
    },
    [queue, index, current],
  );

  // Troca de faixa
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !current) return;
    audio.src = audioUrl(current.id);
    if (autoplayRef.current) {
      audio.play().catch(() => setPlaying(false));
    }
    autoplayRef.current = true;
  }, [current?.id]);

  // Persistência da fila
  useEffect(() => {
    try {
      if (!queue.length) localStorage.removeItem(STORAGE_KEY);
      else {
        const state: SavedState = { queue, original, index, shuffle, repeat };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      }
    } catch {
      // armazenamento indisponível (aba privada etc.): segue sem retomar
    }
  }, [queue, original, index, shuffle, repeat]);

  // Controles na tela de bloqueio / fones / teclado de mídia
  useEffect(() => {
    if (!('mediaSession' in navigator) || !current) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: current.title,
      artist: current.artist ?? '',
      album: current.album ?? '',
      artwork: current.hasCover ? [{ src: coverUrl(current.id), type: 'image/jpeg' }] : [],
    });
  }, [current]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    ms.setActionHandler('play', toggle);
    ms.setActionHandler('pause', toggle);
    ms.setActionHandler('nexttrack', next);
    ms.setActionHandler('previoustrack', prev);
    ms.setActionHandler('seekto', (d) => d.seekTime !== undefined && seek(d.seekTime));
  }, [toggle, next, prev, seek]);

  useEffect(() => {
    if (!('mediaSession' in navigator) || !duration || !Number.isFinite(duration)) return;
    try {
      navigator.mediaSession.setPositionState({
        duration,
        position: Math.min(time, duration),
        playbackRate: 1,
      });
    } catch {
      // alguns navegadores rejeitam estados transitórios
    }
  }, [time, duration]);

  const value = useMemo(
    () => ({
      queue,
      index,
      current,
      playing,
      time,
      duration,
      shuffle,
      repeat,
      playTracks,
      toggle,
      next,
      prev,
      seek,
      playAt: goTo,
      removeAt,
      playNext,
      addToQueue,
      toggleShuffle,
      cycleRepeat,
      updateTrack,
      forget,
      audioRef,
    }),
    [
      forget,
      queue,
      index,
      current,
      playing,
      time,
      duration,
      shuffle,
      repeat,
      playTracks,
      toggle,
      next,
      prev,
      seek,
      goTo,
      removeAt,
      playNext,
      addToQueue,
      toggleShuffle,
      cycleRepeat,
      updateTrack,
    ],
  );

  return (
    <PlayerContext.Provider value={value}>
      {children}
      <audio
        ref={audioRef}
        preload="auto"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onLoadedMetadata={(e) => {
          if (pendingSeekRef.current) {
            e.currentTarget.currentTime = pendingSeekRef.current;
            pendingSeekRef.current = 0;
          }
        }}
        onTimeUpdate={(e) => {
          const t = e.currentTarget.currentTime;
          setTime(t);
          if (Math.abs(t - lastTimeSaveRef.current) > 5) {
            lastTimeSaveRef.current = t;
            try {
              localStorage.setItem(TIME_KEY, String(t));
            } catch {
              // ignora
            }
          }
        }}
        onDurationChange={(e) => setDuration(e.currentTarget.duration)}
        onEnded={() => (repeat === 'one' ? restart() : next())}
      />
    </PlayerContext.Provider>
  );
}
