import { useEffect, useRef } from 'react';
import { coverUrl, formatTime } from '../api';
import { usePlayer } from '../player';
import { Cover } from './Cover';
import { Visualizer } from './Visualizer';
import {
  ChevronDownIcon,
  CloseIcon,
  NextIcon,
  PauseIcon,
  PlayIcon,
  PrevIcon,
  RepeatIcon,
  RepeatOneIcon,
  ShuffleIcon,
} from './icons';

const REPEAT_LABEL = { off: 'Repetir: desligado', all: 'Repetir: fila', one: 'Repetir: esta música' };

export function NowPlaying({ onClose }: { onClose: () => void }) {
  const p = usePlayer();

  const pulseRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Botão "voltar" do Android/navegador fecha a tela em vez de sair do app.
  useEffect(() => {
    history.pushState({ nowPlaying: true }, '');
    const onPop = () => onCloseRef.current();
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const close = () => history.back();

  if (!p.current) return null;
  const upNext = p.queue.slice(p.index + 1);
  const cover = p.current.hasCover ? coverUrl(p.current.id) : null;

  return (
    <div className="now-playing" role="dialog" aria-modal aria-label="Tocando agora">
      {cover && <img className="np-backdrop" src={cover} alt="" aria-hidden />}
      <header className="np-header">
        <button className="icon-btn" onClick={close} aria-label="Fechar">
          <ChevronDownIcon />
        </button>
        <span>Tocando agora</span>
        <span style={{ width: 40 }} />
      </header>

      <div className="np-main">
        <div className="np-cover">
          <div className="np-pulse" ref={pulseRef}>
            <Cover trackId={p.current.hasCover ? p.current.id : null} size={320} />
          </div>
        </div>
        <Visualizer audioRef={p.audioRef} playing={p.playing} pulseRef={pulseRef} />
        <div className="np-info">
          <span className="np-title">{p.current.title}</span>
          <span className="track-sub">{p.current.artist ?? 'Artista desconhecido'}</span>
        </div>

        <input
          className="np-seek"
          type="range"
          min={0}
          max={p.duration || 0}
          step={0.1}
          value={p.time}
          onChange={(e) => p.seek(Number(e.target.value))}
          aria-label="Posição"
        />
        <div className="np-times">
          <span>{formatTime(p.time)}</span>
          <span>{formatTime(p.duration)}</span>
        </div>

        <div className="np-controls">
          <button
            className={`icon-btn${p.shuffle ? ' on' : ''}`}
            onClick={p.toggleShuffle}
            aria-label={p.shuffle ? 'Aleatório: ligado' : 'Aleatório: desligado'}
            aria-pressed={p.shuffle}
          >
            <ShuffleIcon />
          </button>
          <button className="icon-btn big" onClick={p.prev} aria-label="Anterior">
            <PrevIcon />
          </button>
          <button
            className="icon-btn play big"
            onClick={p.toggle}
            aria-label={p.playing ? 'Pausar' : 'Tocar'}
          >
            {p.playing ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button className="icon-btn big" onClick={p.next} aria-label="Próxima">
            <NextIcon />
          </button>
          <button
            className={`icon-btn${p.repeat !== 'off' ? ' on' : ''}`}
            onClick={p.cycleRepeat}
            aria-label={REPEAT_LABEL[p.repeat]}
            title={REPEAT_LABEL[p.repeat]}
          >
            {p.repeat === 'one' ? <RepeatOneIcon /> : <RepeatIcon />}
          </button>
        </div>
      </div>

      <section className="np-queue">
        <h3>A seguir</h3>
        {!upNext.length && (
          <p className="track-sub">
            {p.repeat === 'all' ? 'A fila recomeça do início.' : 'Fim da fila.'}
          </p>
        )}
        <ul className="track-list">
          {upNext.map((t, offset) => {
            const i = p.index + 1 + offset;
            return (
              <li key={`${t.id}-${i}`}>
                <button className="track-main" onClick={() => p.playAt(i)}>
                  <Cover trackId={t.hasCover ? t.id : null} size={40} />
                  <span className="track-text">
                    <span className="track-title">{t.title}</span>
                    <span className="track-sub">{t.artist ?? 'Artista desconhecido'}</span>
                  </span>
                  <span className="track-duration">{formatTime(t.duration)}</span>
                </button>
                <div className="track-actions">
                  <button className="icon-btn" title="Remover da fila" onClick={() => p.removeAt(i)}>
                    <CloseIcon />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
