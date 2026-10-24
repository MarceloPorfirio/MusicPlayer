import { formatTime } from '../api';
import { usePlayer } from '../player';
import { Cover } from './Cover';
import { NextIcon, PauseIcon, PlayIcon, PrevIcon } from './icons';

export function PlayerBar() {
  const { current, playing, time, duration, toggle, next, prev, seek } = usePlayer();
  if (!current) return null;

  return (
    <footer className="player-bar">
      <input
        className="seek"
        type="range"
        min={0}
        max={duration || 0}
        step={0.1}
        value={time}
        onChange={(e) => seek(Number(e.target.value))}
        aria-label="Posição"
      />
      <div className="player-row">
        <Cover trackId={current.hasCover ? current.id : null} size={44} />
        <div className="track-text">
          <span className="track-title">{current.title}</span>
          <span className="track-sub">
            {current.artist ?? 'Artista desconhecido'} · {formatTime(time)} / {formatTime(duration)}
          </span>
        </div>
        <div className="player-controls">
          <button className="icon-btn" onClick={prev} aria-label="Anterior">
            <PrevIcon />
          </button>
          <button className="icon-btn play" onClick={toggle} aria-label={playing ? 'Pausar' : 'Tocar'}>
            {playing ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button className="icon-btn" onClick={next} aria-label="Próxima">
            <NextIcon />
          </button>
        </div>
      </div>
    </footer>
  );
}
