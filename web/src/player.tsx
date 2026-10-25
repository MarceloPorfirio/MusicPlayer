import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type SyntheticEvent,
} from 'react';
import { audioUrl, coverUrl, type Track } from './api';
import { recordPlay } from './history';
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
  /** Segundos de transição entre faixas (0 = desligada). */
  crossfade: number;
  /** O navegador deixa a página controlar o volume? (No iPhone não: sem transição.) */
  crossfadeSupported: boolean;
  setCrossfade: (seconds: number) => void;
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
  /** Os dois elementos <audio> (o ativo e o da transição), para o visualizador. */
  getDecks: () => HTMLAudioElement[];
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
const CROSSFADE_KEY = 'crossfade-seconds';

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

function loadCrossfade() {
  try {
    return Number(localStorage.getItem(CROSSFADE_KEY)) || 0;
  } catch {
    return 0;
  }
}

/** iOS ignora `audio.volume` (o volume é só o do sistema): sem isso não há como cruzar faixas. */
const VOLUME_CONTROL = (() => {
  try {
    const probe = new Audio();
    probe.volume = 0.5;
    return probe.volume === 0.5;
  } catch {
    return false;
  }
})();

/** Transição em andamento: a faixa anterior saindo no deck que deixou de ser o ativo. */
interface Fade {
  timer: ReturnType<typeof setInterval>;
  from: HTMLAudioElement;
  to: HTMLAudioElement;
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [saved] = useState(loadSaved);
  // Dois "decks": um é sempre o ativo (tudo na tela vem dele); o outro só toca durante a
  // transição, com a faixa anterior saindo.
  const deckA = useRef<HTMLAudioElement>(null);
  const deckB = useRef<HTMLAudioElement>(null);
  const activeDeck = useRef<0 | 1>(0);
  const active = useCallback(() => (activeDeck.current === 0 ? deckA : deckB).current, []);
  const idle = useCallback(() => (activeDeck.current === 0 ? deckB : deckA).current, []);
  const getDecks = useCallback(
    () => [deckA.current, deckB.current].filter((d): d is HTMLAudioElement => d !== null),
    [],
  );

  const [queue, setQueue] = useState<Track[]>(saved?.queue ?? []);
  /** Ordem antes do aleatório, para voltar a ela ao desligar. */
  const [original, setOriginal] = useState<Track[]>(saved?.original ?? []);
  const [index, setIndex] = useState(saved?.index ?? -1);
  const [shuffle, setShuffle] = useState(saved?.shuffle ?? false);
  const [repeat, setRepeat] = useState<RepeatMode>(saved?.repeat ?? 'off');
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(saved?.time ?? 0);
  const [duration, setDuration] = useState(0);
  const [crossfade, setCrossfadeState] = useState(loadCrossfade);

  // Ao restaurar a fila, carrega a faixa parada na posição salva; nas demais trocas, toca.
  const autoplayRef = useRef(!saved);
  const pendingSeekRef = useRef(saved?.time ?? 0);
  const lastTimeSaveRef = useRef(0);
  /** Faixa cuja reprodução atual já entrou no histórico (conta uma vez por vez que toca). */
  const countedRef = useRef<number | null>(null);
  const fadeRef = useRef<Fade | null>(null);
  /** Faixa que a transição já carregou no deck ativo: a troca de faixa não recarrega. */
  const preloadedRef = useRef<number | null>(null);

  const current = queue[index] ?? null;
  const { canPlay } = useOffline();

  /** Interrompe a transição: a faixa anterior para na hora e a atual fica no volume cheio. */
  const cancelFade = useCallback(() => {
    const fade = fadeRef.current;
    if (!fade) return;
    clearInterval(fade.timer);
    fade.from.pause();
    fade.from.volume = 1;
    fade.to.volume = 1;
    fadeRef.current = null;
  }, []);

  const setCrossfade = useCallback((seconds: number) => {
    setCrossfadeState(seconds);
    try {
      localStorage.setItem(CROSSFADE_KEY, String(seconds));
    } catch {
      // só não lembra na próxima vez
    }
  }, []);

  const restart = useCallback(() => {
    const audio = active();
    if (!audio) return;
    cancelFade();
    countedRef.current = null; // tocar de novo conta de novo
    audio.currentTime = 0;
    audio.play().catch((err) => console.warn('Falha ao tocar:', err));
  }, [active, cancelFade]);

  const goTo = useCallback(
    (i: number) => {
      cancelFade();
      autoplayRef.current = true;
      if (i === index) restart();
      else setIndex(i);
    },
    [index, restart, cancelFade],
  );

  const playTracks = useCallback(
    (tracks: Track[], start?: Track, shuffleMode?: boolean) => {
      const ready = tracks.filter(canPlay);
      if (!ready.length) return;
      cancelFade();
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
    [canPlay, shuffle, current, restart, cancelFade],
  );

  /** Índice da faixa seguinte, ou -1 no fim da fila. */
  const nextIndex = useCallback(() => {
    if (index + 1 < queue.length) return index + 1;
    return repeat === 'all' && queue.length ? 0 : -1;
  }, [index, queue.length, repeat]);

  const next = useCallback(() => {
    const i = nextIndex();
    if (i >= 0) goTo(i);
  }, [nextIndex, goTo]);

  const prev = useCallback(() => {
    const audio = active();
    if (audio && audio.currentTime > 3) {
      cancelFade();
      audio.currentTime = 0;
    } else if (index > 0) goTo(index - 1);
    else if (repeat === 'all' && queue.length) goTo(queue.length - 1);
    else if (audio) audio.currentTime = 0;
  }, [active, index, queue.length, repeat, goTo, cancelFade]);

  const toggle = useCallback(() => {
    const audio = active();
    if (!audio?.src) return;
    if (audio.paused) audio.play().catch((err) => console.warn('Falha ao tocar:', err));
    else {
      cancelFade();
      audio.pause();
    }
  }, [active, cancelFade]);

  const seek = useCallback(
    (seconds: number) => {
      const audio = active();
      if (!audio) return;
      cancelFade();
      audio.currentTime = seconds;
    },
    [active, cancelFade],
  );

  /** Começa a próxima faixa no deck livre, em volume zero, e cruza os volumes. */
  const startFade = useCallback(
    (to: number, seconds: number) => {
      const from = active();
      const deck = idle();
      const track = queue[to];
      if (!from || !deck || !track || fadeRef.current) return;

      deck.src = audioUrl(track.id);
      deck.volume = 0;
      deck.play().catch(() => {});
      activeDeck.current = activeDeck.current === 0 ? 1 : 0;
      preloadedRef.current = track.id;
      setIndex(to);

      const started = performance.now();
      const timer = setInterval(() => {
        const p = Math.min(1, (performance.now() - started) / (seconds * 1000));
        deck.volume = p;
        from.volume = 1 - p;
        if (p >= 1) {
          clearInterval(timer);
          from.pause();
          from.volume = 1;
          fadeRef.current = null;
        }
      }, 50);
      fadeRef.current = { timer, from, to: deck };
    },
    [active, idle, queue],
  );

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
      cancelFade();
      const remaining = queue.filter((t) => t.id !== trackId);
      // Quantas faixas restantes vinham antes da atual: é o novo índice dela (ou da seguinte).
      const before = queue.slice(0, index).filter((t) => t.id !== trackId).length;
      setOriginal((o) => o.filter((t) => t.id !== trackId));
      setQueue(remaining);

      if (current?.id !== trackId) {
        setIndex(before);
        return;
      }
      const audio = active();
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
    [queue, index, current, active, cancelFade],
  );

  // Troca de faixa
  useEffect(() => {
    const audio = active();
    if (!audio || !current) return;
    countedRef.current = null;
    // A transição já carregou e está tocando esta faixa no deck ativo.
    if (preloadedRef.current === current.id) {
      preloadedRef.current = null;
      return;
    }
    preloadedRef.current = null;
    cancelFade();
    audio.volume = 1;
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

  // Eventos dos dois decks: só o ativo manda na tela. O deck da transição terminando
  // ou pausando não pode parar o player nem pular faixa.
  const isActive = (e: SyntheticEvent<HTMLAudioElement>) => e.currentTarget === active();

  const onTimeUpdate = (e: SyntheticEvent<HTMLAudioElement>) => {
    if (!isActive(e)) return;
    const audio = e.currentTarget;
    const t = audio.currentTime;
    const d = audio.duration;
    setTime(t);

    // Conta como ouvida depois de 30 s (ou da metade, em faixa curta).
    if (current && countedRef.current !== current.id) {
      if (t >= (Number.isFinite(d) ? Math.min(30, d / 2) : 30)) {
        countedRef.current = current.id;
        recordPlay(current.id);
      }
    }

    // Chegando ao fim: começa a próxima por cima. Faixa curta demais não cruza.
    if (
      crossfade > 0 &&
      VOLUME_CONTROL &&
      !fadeRef.current &&
      !audio.paused &&
      repeat !== 'one' &&
      Number.isFinite(d) &&
      d > crossfade * 3 &&
      d - t <= crossfade
    ) {
      const to = nextIndex();
      if (to >= 0 && to !== index && canPlay(queue[to])) startFade(to, Math.max(0.5, d - t));
    }

    if (Math.abs(t - lastTimeSaveRef.current) > 5) {
      lastTimeSaveRef.current = t;
      try {
        localStorage.setItem(TIME_KEY, String(t));
      } catch {
        // ignora
      }
    }
  };

  const deckProps = {
    preload: 'auto',
    onPlay: (e: SyntheticEvent<HTMLAudioElement>) => isActive(e) && setPlaying(true),
    onPause: (e: SyntheticEvent<HTMLAudioElement>) => isActive(e) && setPlaying(false),
    onLoadedMetadata: (e: SyntheticEvent<HTMLAudioElement>) => {
      if (isActive(e) && pendingSeekRef.current) {
        e.currentTarget.currentTime = pendingSeekRef.current;
        pendingSeekRef.current = 0;
      }
    },
    onTimeUpdate,
    onDurationChange: (e: SyntheticEvent<HTMLAudioElement>) =>
      isActive(e) && setDuration(e.currentTarget.duration),
    onEnded: (e: SyntheticEvent<HTMLAudioElement>) => {
      if (isActive(e)) {
        if (repeat === 'one') restart();
        else next();
      }
    },
  } as const;

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
      crossfade,
      crossfadeSupported: VOLUME_CONTROL,
      setCrossfade,
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
      getDecks,
    }),
    [
      queue,
      index,
      current,
      playing,
      time,
      duration,
      shuffle,
      repeat,
      crossfade,
      setCrossfade,
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
      forget,
      getDecks,
    ],
  );

  return (
    <PlayerContext.Provider value={value}>
      {children}
      <audio ref={deckA} {...deckProps} />
      <audio ref={deckB} {...deckProps} />
    </PlayerContext.Provider>
  );
}
