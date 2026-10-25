import { useEffect, useRef, useState, type RefObject } from 'react';

const BARS = 40;

type CapturableAudio = HTMLAudioElement & { captureStream?: () => MediaStream };

let sharedContext: AudioContext | null = null;

/** Liga um <audio> ao analisador, acompanhando as trocas de faixa. */
function captureInto(ctx: AudioContext, analyser: AnalyserNode, audio: CapturableAudio) {
  const stream = audio.captureStream!();
  let source: MediaStreamAudioSourceNode | null = null;
  // A cada troca de faixa o stream ganha uma trilha nova, mas o Chrome mantém as antigas
  // como "live" — e createMediaStreamSource(stream) pega a de menor id, não a mais nova.
  // Por isso conecta só a última trilha, num stream próprio, e encerra as anteriores.
  const connect = () => {
    source?.disconnect();
    source = null;
    const tracks = stream.getAudioTracks();
    const latest = tracks.at(-1);
    if (!latest) return;
    for (const old of tracks.slice(0, -1)) {
      old.stop();
      stream.removeTrack(old);
    }
    source = ctx.createMediaStreamSource(new MediaStream([latest]));
    source.connect(analyser);
  };
  connect();
  stream.addEventListener('addtrack', connect);
  return () => {
    stream.removeEventListener('addtrack', connect);
    source?.disconnect();
  };
}

/**
 * Analisa o áudio via captureStream(): lê uma cópia do som sem desviar a saída do <audio>.
 * (createMediaElementSource desviaria, e no iOS a música pararia com a tela bloqueada.)
 * Recebe os dois decks do player: na transição entre faixas, as barras mostram a mistura.
 * Retorna null onde não há suporte (Safari, Firefox) — aí o visual cai para animação CSS.
 */
function createAnalyser(decks: CapturableAudio[]) {
  if (!decks.length || decks.some((d) => typeof d.captureStream !== 'function')) return null;
  if (typeof AudioContext === 'undefined') return null;
  sharedContext ??= new AudioContext();
  const ctx = sharedContext;
  void ctx.resume();

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.8;
  const disposers = decks.map((deck) => captureInto(ctx, analyser, deck));

  return {
    analyser,
    dispose() {
      disposers.forEach((dispose) => dispose());
    },
  };
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

interface Props {
  getDecks: () => HTMLAudioElement[];
  playing: boolean;
  /** Elemento que pulsa com o grave (a capa). */
  pulseRef?: RefObject<HTMLElement | null>;
}

export function Visualizer({ getDecks, playing, pulseRef }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [live, setLive] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || reducedMotion()) return setLive(false);
    const capture = createAnalyser(getDecks() as CapturableAudio[]);
    if (!capture) return setLive(false);

    const { analyser } = capture;
    const data = new Uint8Array(analyser.frequencyBinCount);
    const g = canvas.getContext('2d')!;
    const accent = getComputedStyle(canvas).getPropertyValue('--accent').trim() || '#1db954';
    const heights = new Float32Array(BARS);
    let frame = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const draw = () => {
      frame = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(data);
      const { width, height } = canvas;
      g.clearRect(0, 0, width, height);

      // Faixas em escala logarítmica até ~10 kHz (acima disso quase não há energia),
      // com ganho crescente nos agudos para as barras da direita também se mexerem.
      const usable = Math.floor(data.length * 0.45);
      let bass = 0;
      for (let i = 0; i < BARS; i++) {
        const from = Math.floor(Math.pow(usable, i / BARS));
        const to = Math.max(from + 1, Math.floor(Math.pow(usable, (i + 1) / BARS)));
        let sum = 0;
        for (let j = from; j < to; j++) sum += data[j];
        const value = Math.min(1, (sum / (to - from) / 255) * (1 + (i / BARS) * 0.9));
        heights[i] += (value - heights[i]) * 0.35; // suaviza a queda
        if (i < 4) bass += value / 4;
      }

      const gap = width / BARS;
      const barWidth = gap * 0.55;
      const mid = height / 2;
      g.fillStyle = accent;
      for (let i = 0; i < BARS; i++) {
        const h = Math.max(barWidth, heights[i] * height * 0.95);
        g.globalAlpha = 0.45 + heights[i] * 0.55;
        g.beginPath();
        g.roundRect(i * gap + (gap - barWidth) / 2, mid - h / 2, barWidth, h, barWidth / 2);
        g.fill();
      }

      if (pulseRef?.current) pulseRef.current.style.transform = `scale(${1 + bass * 0.05})`;
    };
    draw();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      capture.dispose();
      if (pulseRef?.current) pulseRef.current.style.transform = '';
    };
  }, [getDecks, pulseRef]);

  if (!live) {
    return (
      <div className={`fake-bars${playing ? ' playing' : ''}`} aria-hidden>
        {Array.from({ length: 24 }, (_, i) => (
          <span key={i} style={{ animationDelay: `${(i * 137) % 900}ms` }} />
        ))}
      </div>
    );
  }
  return <canvas ref={canvasRef} className="visualizer" aria-hidden />;
}

/** Três barrinhas animadas indicando a faixa que está tocando. */
export function Equalizer({ playing }: { playing: boolean }) {
  return (
    <span className={`equalizer${playing ? ' playing' : ''}`} aria-hidden>
      <span />
      <span />
      <span />
    </span>
  );
}
