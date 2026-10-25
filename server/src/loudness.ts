import { spawn } from 'node:child_process';
import { rename, rm } from 'node:fs/promises';
import { FFMPEG_BIN } from './config.js';

// -14 LUFS é o padrão de Spotify/YouTube. O pico fica com folga para o encoder AAC não estourar.
const TARGET_LUFS = -14;
const MAX_PEAK_DBFS = -1.5;
// Diferença menor que isto não se ouve: não vale re-encodar.
const MIN_GAIN_DB = 0.5;

function ffmpeg(args: string[], onStdoutLine?: (line: string) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG_BIN, ['-hide_banner', '-nostdin', ...args], { windowsHide: true });
    let stderr = '';
    proc.stderr.setEncoding('utf8');
    proc.stderr.on('data', (chunk: string) => (stderr += chunk));
    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', (chunk: string) =>
      chunk.split(/\r?\n/).forEach((l) => l && onStdoutLine?.(l)),
    );
    proc.on('error', (err) => reject(new Error(`Não foi possível executar o ffmpeg: ${err.message}`)));
    proc.on('close', (code) =>
      code === 0 ? resolve(stderr) : reject(new Error(`ffmpeg saiu com código ${code}: ${stderr.slice(-300)}`)),
    );
  });
}

/** Volume integrado (LUFS), pico verdadeiro (dBFS) e duração (s), pelo filtro ebur128. */
async function measure(file: string) {
  const report = await ffmpeg(['-i', file, '-af', 'ebur128=peak=true:framelog=quiet', '-f', 'null', '-']);
  const summary = report.slice(report.lastIndexOf('Summary:'));
  const lufs = Number(summary.match(/I:\s+(-?[\d.]+|-inf) LUFS/)?.[1]);
  const peak = Number(summary.match(/Peak:\s+(-?[\d.]+|-inf) dBFS/)?.[1]);
  const [, h, m, s] = report.match(/Duration: (\d+):(\d+):([\d.]+)/) ?? [];
  const duration = h ? Number(h) * 3600 + Number(m) * 60 + Number(s) : 0;
  return { lufs, peak, duration };
}

/**
 * Normaliza o volume do arquivo no lugar com um ganho linear: mede, calcula quanto subir ou
 * descer para chegar a -14 LUFS sem o pico passar de -1,5 dBFS, e re-encoda em AAC.
 * Sem compressão dinâmica: a música não fica "achatada", só mais alta ou mais baixa.
 * Retorna o ganho aplicado em dB (0 se não precisou). `onProgress` recebe de 0 a 1.
 */
export async function normalizeLoudness(
  file: string,
  onProgress?: (fraction: number) => void,
): Promise<number> {
  const { lufs, peak, duration } = await measure(file);
  // A medição é rápida; o grosso do tempo é re-encodar.
  onProgress?.(0.15);
  // Silêncio ou faixa curta demais para medir: não há o que ajustar.
  if (!Number.isFinite(lufs)) return 0;

  const headroom = Number.isFinite(peak) ? MAX_PEAK_DBFS - peak : Infinity;
  const gain = Math.min(TARGET_LUFS - lufs, headroom);
  if (Math.abs(gain) < MIN_GAIN_DB) return 0;

  const tmp = `${file}.norm.m4a`;
  try {
    await ffmpeg(
      [
        '-y', '-i', file,
        '-map', '0:a:0', '-map_metadata', '0',
        '-af', `volume=${gain.toFixed(2)}dB`,
        '-c:a', 'aac', '-b:a', '160k',
        // Índice no começo do arquivo: o streaming começa a tocar sem baixar tudo.
        '-movflags', '+faststart',
        // Progresso em stdout ("out_time_us=..."), para a barra no app.
        '-progress', 'pipe:1', '-nostats',
        tmp,
      ],
      (line) => {
        const us = Number(line.match(/^out_time_us=(\d+)/)?.[1]);
        if (us && duration) onProgress?.(0.15 + 0.85 * Math.min(1, us / 1e6 / duration));
      },
    );
    await rename(tmp, file);
  } finally {
    await rm(tmp, { force: true });
  }
  return gain;
}
