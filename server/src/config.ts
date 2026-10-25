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
/**
 * "local": o próprio servidor baixa com o yt-dlp (padrão, bom para rodar em casa).
 * "worker": o servidor nunca acessa o YouTube; só enfileira, e um worker num IP
 * residencial (npm run worker) busca, baixa e envia os arquivos. Necessário em VPS,
 * cujo IP de datacenter o YouTube bloqueia.
 */
export const DOWNLOAD_MODE: 'local' | 'worker' =
  process.env.DOWNLOAD_MODE === 'worker' ? 'worker' : 'local';
/** Token que o worker manda em Authorization: Bearer. Sem ele as rotas do worker ficam fechadas. */
export const WORKER_TOKEN = process.env.WORKER_TOKEN || undefined;
/** Opções extras para todas as chamadas do yt-dlp, ex.: "--sleep-requests 1 --cookies /app/data/cookies.txt". */
export const YTDLP_ARGS = process.env.YTDLP_ARGS?.trim().split(/\s+/).filter(Boolean) ?? [];

/** Sem senha configurada o login fica desligado (uso local). Em servidor público, defina sempre. */
export const APP_PASSWORD = process.env.APP_PASSWORD || undefined;
export const SESSION_SECRET = process.env.SESSION_SECRET || undefined;
/** Atrás de um proxy reverso (Caddy/Nginx), para o cookie Secure e o IP do cliente. */
export const TRUST_PROXY = process.env.TRUST_PROXY === 'true';
