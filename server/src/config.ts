import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * No Windows, o winget instala o yt-dlp/ffmpeg em %LOCALAPPDATA%\Microsoft\WinGet\Packages
 * e só atualiza o PATH de processos novos. Procura lá para não depender de reiniciar o terminal.
 * Retorna o caminho do executável, ou a pasta dele quando `dirOnly`.
 */
function findWinget(packagePrefix: string, exe: string, dirOnly = false): string | undefined {
  if (process.platform !== 'win32' || !process.env.LOCALAPPDATA) return;
  const packages = path.join(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Packages');
  if (!existsSync(packages)) return;
  for (const pkg of readdirSync(packages).filter((d) => d.startsWith(packagePrefix))) {
    const found = readdirSync(path.join(packages, pkg), { recursive: true, encoding: 'utf8' }).find(
      (f) => path.basename(f).toLowerCase() === exe,
    );
    if (found) {
      const full = path.join(packages, pkg, found);
      return dirOnly ? path.dirname(full) : full;
    }
  }
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const PORT = Number(process.env.PORT ?? 3000);
export const HOST = process.env.HOST ?? '0.0.0.0';
export const DATA_DIR = process.env.DATA_DIR ?? path.join(root, 'data');
export const MEDIA_DIR = path.join(DATA_DIR, 'media');
export const DB_PATH = path.join(DATA_DIR, 'library.db');
export const WEB_DIST = path.join(root, 'web', 'dist');
export const YTDLP_BIN = process.env.YTDLP_BIN ?? findWinget('yt-dlp.yt-dlp_', 'yt-dlp.exe') ?? 'yt-dlp';
export const FFMPEG_DIR = process.env.FFMPEG_DIR ?? findWinget('yt-dlp.FFmpeg_', 'ffmpeg.exe', true);
export const DOWNLOAD_CONCURRENCY = Number(process.env.DOWNLOAD_CONCURRENCY ?? 2);
