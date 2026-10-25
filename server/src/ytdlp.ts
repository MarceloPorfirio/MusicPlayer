import { spawn } from 'node:child_process';
import { FFMPEG_DIR, MEDIA_DIR, YTDLP_ARGS, YTDLP_BIN } from './config.js';

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

/** Baixa só o áudio como .m4a + capa .jpg em MEDIA_DIR/<basename>.* */
export async function downloadAudio(
  url: string,
  basename: string,
  onProgress: (percent: number) => void,
): Promise<{ file: string; cover: string }> {
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
      '-P', MEDIA_DIR,
      '-o', `${basename}.%(ext)s`,
      url,
    ],
    (line) => {
      const match = line.match(/([\d.]+)%/);
      if (match) onProgress(Number(match[1]));
    },
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
