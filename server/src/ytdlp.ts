import { spawn } from 'node:child_process';
import path from 'node:path';
import { FFMPEG_DIR, MEDIA_DIR, YTDLP_ARGS, YTDLP_BIN } from './config.js';
import { normalizeLoudness } from './loudness.js';

export interface MediaInfo {
  _type?: string;
  id: string;
  extractor_key: string;
  webpage_url: string;
  entries?: PlaylistEntry[];
  title: string;
  track?: string;
  artist?: string;
  creator?: string;
  album?: string;
  uploader?: string;
  channel?: string;
  duration?: number;
}

/** Item de playlist com --flat-playlist: só os dados básicos, sem abrir cada vídeo. */
export interface PlaylistEntry {
  id: string;
  ie_key?: string;
  url: string;
  title?: string;
  channel?: string;
  uploader?: string;
  duration?: number | null;
}

function run(args: string[], onLine?: (line: string) => void): Promise<string> {
  const fullArgs = [
    ...(FFMPEG_DIR ? ['--ffmpeg-location', FFMPEG_DIR] : []),
    ...YTDLP_ARGS,
    ...args,
  ];
  return new Promise((resolve, reject) => {
    const proc = spawn(YTDLP_BIN, fullArgs, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    proc.stdout.setEncoding('utf8');
    proc.stderr.setEncoding('utf8');
    proc.stdout.on('data', (chunk: string) => {
      stdout += chunk;
      if (onLine) chunk.split(/\r?\n/).forEach((l) => l && onLine(l));
    });
    proc.stderr.on('data', (chunk: string) => (stderr += chunk));
    proc.on('error', (err) =>
      reject(new Error(`Não foi possível executar "${YTDLP_BIN}": ${err.message}`)),
    );
    proc.on('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(lastErrorLine(stderr) ?? `yt-dlp saiu com código ${code}`));
    });
  });
}

function lastErrorLine(stderr: string): string | undefined {
  const lines = stderr.trim().split(/\r?\n/).filter(Boolean);
  return lines.findLast((l) => l.startsWith('ERROR')) ?? lines.at(-1);
}

/**
 * Metadados de um vídeo ou de uma playlist (_type === 'playlist', com `entries`).
 * URLs de vídeo dentro de playlist (watch?v=...&list=...) contam como vídeo.
 */
export async function fetchInfo(url: string): Promise<MediaInfo> {
  const json = await run(['-J', '--flat-playlist', '--no-playlist', '--no-warnings', url]);
  return JSON.parse(json) as MediaInfo;
}

/**
 * Só os campos que o servidor usa. O JSON completo de um vídeo tem centenas de KB
 * (lista de formatos etc.), e o worker o envia pela internet.
 */
export function trimInfo(info: MediaInfo): MediaInfo {
  const { _type, id, extractor_key, webpage_url, title, track, artist, creator, album, uploader, channel, duration } =
    info;
  return {
    _type,
    id,
    extractor_key,
    webpage_url,
    title,
    track,
    artist,
    creator,
    album,
    uploader,
    channel,
    duration,
    entries: info.entries?.map(({ id, ie_key, url, title, channel, uploader, duration }) => ({
      id,
      ie_key,
      url,
      title,
      channel,
      uploader,
      duration,
    })),
  };
}

/** Converte um item de playlist no formato de vídeo; null se privado/removido. */
export function entryToInfo(entry: PlaylistEntry): MediaInfo | null {
  if (!entry.id || !entry.title || /^\[(private|deleted) video\]$/i.test(entry.title)) return null;
  return {
    id: entry.id,
    extractor_key: entry.ie_key ?? 'Youtube',
    webpage_url: entry.url,
    title: entry.title,
    channel: entry.channel,
    uploader: entry.uploader,
    duration: entry.duration ?? undefined,
  };
}

export interface SearchResult {
  id: string;
  title: string;
  channel: string | null;
  duration: number | null;
  url: string;
}

/** Busca no YouTube. Com --flat-playlist é uma requisição só, sem abrir cada vídeo. */
export async function searchYoutube(query: string, limit = 10): Promise<SearchResult[]> {
  const json = await run(['-J', '--flat-playlist', '--no-warnings', `ytsearch${limit}:${query}`]);
  const info = JSON.parse(json) as MediaInfo;
  return (info.entries ?? [])
    .filter((e) => e.id && e.title)
    .map((e) => ({
      id: e.id,
      title: e.title!,
      channel: (e.channel ?? e.uploader)?.replace(/ - Topic$|\s*VEVO$/i, '') ?? null,
      duration: e.duration ? Math.round(e.duration) : null,
      url: e.url || `https://www.youtube.com/watch?v=${e.id}`,
    }));
}

export type DownloadStage = 'preparing' | 'downloading' | 'processing' | 'normalizing' | 'uploading';

/**
 * Fatia da barra de progresso (0–100) de cada etapa. O download em si costuma levar 1–2 s;
 * o que demora é preparar (yt-dlp consulta o YouTube) e ajustar o volume.
 */
const STAGE_RANGE: Record<DownloadStage, [number, number]> = {
  preparing: [0, 5],
  downloading: [5, 50],
  processing: [50, 55],
  normalizing: [55, 95],
  uploading: [95, 100],
};

/** Percentual geral (0–100) a partir da etapa e do quanto dela já foi feito (0–1). */
export function overallPercent(stage: DownloadStage, fraction = 0) {
  const [from, to] = STAGE_RANGE[stage];
  return from + (to - from) * Math.min(1, Math.max(0, fraction));
}

export type ProgressFn = (stage: DownloadStage, percent: number) => void;

/** Baixa só o áudio como .m4a + capa .jpg em <outDir>/<basename>.*, já com o volume normalizado. */
export async function downloadAudio(
  url: string,
  basename: string,
  onProgress: ProgressFn,
  outDir = MEDIA_DIR,
): Promise<{ file: string; cover: string }> {
  onProgress('preparing', overallPercent('preparing'));
  await run(
    [
      '--no-playlist',
      '--no-warnings',
      '-f', 'bestaudio[ext=m4a]/bestaudio',
      '-x', '--audio-format', 'm4a',
      '--embed-metadata',
      '--write-thumbnail', '--convert-thumbnails', 'jpg',
      '--newline',
      '--progress-template', 'download:%(progress._percent_str)s',
      '-P', outDir,
      '-o', `${basename}.%(ext)s`,
      url,
    ],
    (raw) => {
      const line = raw.replace(/\x1b\[[\d;]*m/g, ''); // sem códigos de cor ANSI
      const match = line.match(/^download:\s*([\d.]+)%/);
      if (match) onProgress('downloading', overallPercent('downloading', Number(match[1]) / 100));
      // Pós-processamento do yt-dlp: extrair o áudio, gravar metadados, converter a capa.
      else if (/^\[(ExtractAudio|Metadata|ThumbnailsConvertor|FixupM4a)\]/.test(line)) {
        onProgress('processing', overallPercent('processing', 0.5));
      }
    },
  );
  await normalizeLoudness(path.join(outDir, `${basename}.m4a`), (fraction) =>
    onProgress('normalizing', overallPercent('normalizing', fraction)),
  );
  return { file: `${basename}.m4a`, cover: `${basename}.jpg` };
}

/** Tira o "(Official Music Video)", "[4K]", "- Artista" etc. de títulos de vídeo. */
function cleanTitle(title: string, artist: string | undefined) {
  let t = title
    .replace(/\s*[([][^)\]]*\b(official|video|audio|lyrics?|letra|legendado|clipe|visualizer|hd|4k|remaster(ed)?)\b[^)\]]*[)\]]/gi, '')
    .trim();
  if (artist) {
    const escaped = artist.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // "Artista - Música", "Música - Artista" e "Música - Artista (Álbum)"
    t = t
      .replace(new RegExp(`^${escaped}\\s*[-–—]\\s*|\\s*[-–—]\\s*${escaped}(\\s*[([][^)\\]]*[)\\]])*$`, 'i'), '')
      .trim();
  }
  return t || title;
}

/** Normaliza título/artista: o YouTube Music preenche track/artist, vídeos comuns não. */
export function describe(info: MediaInfo) {
  const channel = (info.channel ?? info.uploader)?.replace(/ - Topic$|\s*VEVO$/i, '');
  const artist = info.artist ?? info.creator ?? channel;
  return {
    sourceId: `${info.extractor_key}:${info.id}`,
    sourceUrl: info.webpage_url,
    title: info.track ?? cleanTitle(info.title, artist),
    artist: artist ?? null,
    album: info.album ?? null,
    duration: info.duration ? Math.round(info.duration) : null,
  };
}
