import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { audioUrl, coverUrl, type Track } from './api';
import { useOffline } from './offline';

interface PlayerContextValue {
  queue: Track[];
  current: Track | null;
  playing: boolean;
  time: number;
  duration: number;
  playTracks: (tracks: Track[], start?: Track, shuffle?: boolean) => void;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  seek: (seconds: number) => void;
  /** Atualiza metadados de uma faixa que já está na fila (após edição). */
  updateTrack: (track: Track) => void;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer precisa estar dentro de <PlayerProvider>');
  return ctx;
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [queue, setQueue] = useState<Track[]>([]);
  const [index, setIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const current = queue[index] ?? null;
  const { canPlay } = useOffline();

  const playTracks = useCallback((tracks: Track[], start?: Track, shuffle = false) => {
    const ready = tracks.filter(canPlay);
    if (!ready.length) return;
    if (shuffle) {
      for (let i = ready.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [ready[i], ready[j]] = [ready[j], ready[i]];
      }
    }
    setQueue(ready);
    setIndex(start ? Math.max(0, ready.findIndex((t) => t.id === start.id)) : 0);
    // Mesma faixa clicada de novo: o efeito de troca não dispara, então recomeça aqui.
    const audio = audioRef.current;
    if (audio && start && audio.src.endsWith(audioUrl(start.id))) {
      audio.currentTime = 0;
      audio.play().catch((err) => console.warn('Falha ao tocar:', err));
    }
  }, [canPlay]);

  const next = useCallback(() => {
    setIndex((i) => (i + 1 < queue.length ? i + 1 : i));
  }, [queue.length]);

  const prev = useCallback(() => {
    const audio = audioRef.current;
    if (audio && audio.currentTime > 3) audio.currentTime = 0;
    else setIndex((i) => Math.max(0, i - 1));
  }, []);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio?.src) return;
    if (audio.paused) audio.play().catch((err) => console.warn('Falha ao tocar:', err));
    else audio.pause();
  }, []);

  const seek = useCallback((seconds: number) => {
    if (audioRef.current) audioRef.current.currentTime = seconds;
  }, []);

  const updateTrack = useCallback((track: Track) => {
    setQueue((q) => q.map((t) => (t.id === track.id ? track : t)));
  }, []);

  // Troca de faixa
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !current) return;
    audio.src = audioUrl(current.id);
    void audio.play().catch(() => setPlaying(false));
  }, [current?.id]);

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

  const value = useMemo(
    () => ({ queue, current, playing, time, duration, playTracks, toggle, next, prev, seek, updateTrack }),
    [queue, current, playing, time, duration, playTracks, toggle, next, prev, seek, updateTrack],
  );

  return (
    <PlayerContext.Provider value={value}>
      {children}
      <audio
        ref={audioRef}
        preload="auto"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onDurationChange={(e) => setDuration(e.currentTarget.duration)}
        onEnded={next}
      />
    </PlayerContext.Provider>
  );
}
