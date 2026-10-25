import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { normalizeLoudness } from '../../server/src/loudness.js';
import {
  downloadAudio,
  fetchInfo,
  overallPercent,
  searchYoutube,
  trimInfo,
  type DownloadStage,
} from '../../server/src/ytdlp.js';

const SERVER_URL = process.env.SERVER_URL?.replace(/\/$/, '');
const TOKEN = process.env.WORKER_TOKEN;
if (!SERVER_URL || !TOKEN) {
  console.error('Defina SERVER_URL e WORKER_TOKEN no worker.env (veja worker.env.example).');
  process.exit(1);
}

// O servidor segura o pedido de tarefa até 25 s (long-polling); esta pausa só evita um laço
// apertado se ele responder "nada a fazer" na hora (servidor antigo).
const IDLE_PAUSE_MS = 1_000;
const MAX_BACKOFF_MS = 60_000;
/** O que este worker sabe fazer; o servidor só oferece tarefas desses tipos. */
const CAPABILITIES = ['normalize', 'search'];

type UrlJob = { type: 'import' | 'track'; id: number; url: string };
type Job =
  | UrlJob
  | { type: 'normalize'; id: number }
  | { type: 'search'; id: number; query: string };

class AuthError extends Error {}

const log = (...args: unknown[]) =>
  console.log(new Date().toLocaleString('pt-BR'), ...args);

async function api<T = unknown>(
  method: string,
  pathname: string,
  body?: unknown,
  contentType?: string,
  headers: Record<string, string> = {},
): Promise<T | null> {
  const raw = contentType !== undefined;
  const res = await fetch(SERVER_URL + pathname, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      ...(body !== undefined && { 'Content-Type': contentType ?? 'application/json' }),
      ...headers,
    },
    body: body === undefined ? undefined : raw ? new Uint8Array(body as Buffer) : JSON.stringify(body),
  });
  if (res.status === 401) throw new AuthError('WORKER_TOKEN recusado pelo servidor.');
  if (!res.ok) throw new Error(`${method} ${pathname} → HTTP ${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : ((await res.json()) as T);
}

/** Envios ao servidor tentam algumas vezes: perder um download pronto por um soluço de rede é desperdício. */
async function withRetry<T>(what: string, fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof AuthError || attempt >= 4) throw err;
      log(`  ${what} falhou (tentativa ${attempt}): ${(err as Error).message}`);
      await sleep(attempt * 5000);
    }
  }
}

async function handleImport(job: UrlJob) {
  log(`Buscando ${job.url}`);
  let info;
  try {
    info = await fetchInfo(job.url);
  } catch (err) {
    log(`  falhou: ${(err as Error).message}`);
    await withRetry('aviso de erro', () =>
      api('POST', `/api/worker/imports/${job.id}/error`, { message: (err as Error).message }),
    );
    return;
  }
  const result = await withRetry('envio do resultado', () =>
    api<{ kind: string; playlist?: { name: string }; added?: number }>(
      'POST',
      `/api/worker/imports/${job.id}/result`,
      { info: trimInfo(info) },
    ),
  );
  log(
    result?.kind === 'playlist'
      ? `  playlist "${result.playlist?.name}": ${result.added} faixa(s) nova(s) na fila`
      : `  "${info.title}" na fila`,
  );
}

async function handleTrack(job: UrlJob) {
  log(`Baixando faixa ${job.id}: ${job.url}`);
  const dir = await mkdtemp(path.join(os.tmpdir(), 'musicplayer-worker-'));
  // Manda a etapa e o percentual mais recentes a cada meio segundo (o yt-dlp e o ffmpeg emitem
  // muitas linhas por segundo; mandar cada uma inundaria o servidor).
  let latest: { stage: DownloadStage; percent: number } | null = null;
  const report = () => {
    if (!latest) return;
    const body = latest;
    latest = null;
    return api('POST', `/api/worker/tracks/${job.id}/progress`, body).catch(() => {});
  };
  const reporter = setInterval(report, 500);
  try {
    let files;
    try {
      files = await downloadAudio(
        job.url,
        `track-${job.id}`,
        (stage, percent) => (latest = { stage, percent }),
        dir,
      );
    } catch (err) {
      log(`  falhou: ${(err as Error).message}`);
      await withRetry('aviso de erro', () =>
        api('POST', `/api/worker/tracks/${job.id}/error`, { message: (err as Error).message }),
      );
      return;
    }

    latest = { stage: 'uploading', percent: overallPercent('uploading') };
    await report();

    const coverPath = path.join(dir, files.cover);
    if (existsSync(coverPath)) {
      const cover = await readFile(coverPath);
      await withRetry('envio da capa', () =>
        api('PUT', `/api/worker/tracks/${job.id}/cover`, cover, 'image/jpeg'),
      );
    }
    const audio = await readFile(path.join(dir, files.file));
    // downloadAudio já normaliza o volume.
    await withRetry('envio do áudio', () =>
      api('PUT', `/api/worker/tracks/${job.id}/audio`, audio, 'audio/mp4', { 'X-Normalized': '1' }),
    );
    log(`  pronta (${(audio.length / 1024 / 1024).toFixed(1)} MB)`);
  } finally {
    clearInterval(reporter);
    await rm(dir, { recursive: true, force: true });
  }
}

async function handleSearch(job: { id: number; query: string }) {
  log(`Buscando no YouTube: "${job.query}"`);
  try {
    const results = await searchYoutube(job.query);
    await withRetry('envio dos resultados', () =>
      api('POST', `/api/worker/searches/${job.id}/result`, { results }),
    );
    log(`  ${results.length} resultado(s)`);
  } catch (err) {
    if (err instanceof AuthError) throw err;
    log(`  falhou: ${(err as Error).message}`);
    await withRetry('aviso de erro', () =>
      api('POST', `/api/worker/searches/${job.id}/error`, { message: (err as Error).message }),
    );
  }
}

/** Faixa antiga, baixada antes da normalização: puxa da VPS, ajusta o volume e devolve. */
async function handleNormalize(job: { id: number }) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'musicplayer-worker-'));
  try {
    const res = await fetch(`${SERVER_URL}/api/worker/tracks/${job.id}/source`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    if (res.status === 404) return; // apagada nesse meio-tempo
    if (!res.ok) throw new Error(`download da faixa ${job.id} → HTTP ${res.status}`);
    const file = path.join(dir, `track-${job.id}.m4a`);
    await writeFile(file, new Uint8Array(await res.arrayBuffer()));

    let gain;
    try {
      gain = await normalizeLoudness(file);
    } catch (err) {
      log(`Normalizar faixa ${job.id} falhou: ${(err as Error).message}`);
      await withRetry('aviso de erro', () =>
        api('POST', `/api/worker/tracks/${job.id}/normalize-error`, { message: (err as Error).message }),
      );
      return;
    }
    const audio = await readFile(file);
    await withRetry('envio do áudio', () =>
      api('PUT', `/api/worker/tracks/${job.id}/audio`, audio, 'audio/mp4', { 'X-Normalized': '1' }),
    );
    log(`Volume da faixa ${job.id} normalizado (${gain >= 0 ? '+' : ''}${gain.toFixed(1)} dB)`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

log(`Worker conectando em ${SERVER_URL}`);
let backoff = 0;
let idleLogged = false;

while (true) {
  try {
    const job = await api<Job>('POST', '/api/worker/claim', { capabilities: CAPABILITIES });
    backoff = 0;
    if (!job) {
      if (!idleLogged) log('Fila vazia, aguardando tarefas…');
      idleLogged = true;
      await sleep(IDLE_PAUSE_MS);
      continue;
    }
    idleLogged = false;
    if (job.type === 'search') await handleSearch(job);
    else if (job.type === 'import') await handleImport(job);
    else if (job.type === 'track') await handleTrack(job);
    else await handleNormalize(job);
  } catch (err) {
    if (err instanceof AuthError) {
      log(err.message, 'Confira o WORKER_TOKEN no worker.env e no servidor.');
      process.exit(1);
    }
    backoff = Math.min(MAX_BACKOFF_MS, backoff ? backoff * 2 : 5000);
    log(`Erro falando com o servidor (${(err as Error).message}). Nova tentativa em ${backoff / 1000}s.`);
    await sleep(backoff);
  }
}
