import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { downloadAudio, fetchInfo, trimInfo } from '../../server/src/ytdlp.js';

const SERVER_URL = process.env.SERVER_URL?.replace(/\/$/, '');
const TOKEN = process.env.WORKER_TOKEN;
if (!SERVER_URL || !TOKEN) {
  console.error('Defina SERVER_URL e WORKER_TOKEN no worker.env (veja worker.env.example).');
  process.exit(1);
}

const IDLE_POLL_MS = 10_000;
const MAX_BACKOFF_MS = 60_000;

type Job = { type: 'import' | 'track'; id: number; url: string };

class AuthError extends Error {}

const log = (...args: unknown[]) =>
  console.log(new Date().toLocaleString('pt-BR'), ...args);

async function api<T = unknown>(
  method: string,
  pathname: string,
  body?: unknown,
  contentType?: string,
): Promise<T | null> {
  const raw = contentType !== undefined;
  const res = await fetch(SERVER_URL + pathname, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      ...(body !== undefined && { 'Content-Type': contentType ?? 'application/json' }),
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

async function handleImport(job: Job) {
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

async function handleTrack(job: Job) {
  log(`Baixando faixa ${job.id}: ${job.url}`);
  const dir = await mkdtemp(path.join(os.tmpdir(), 'musicplayer-worker-'));
  try {
    let lastReport = 0;
    let files;
    try {
      files = await downloadAudio(
        job.url,
        `track-${job.id}`,
        (percent) => {
          const now = Date.now();
          if (now - lastReport < 1500) return;
          lastReport = now;
          api('POST', `/api/worker/tracks/${job.id}/progress`, { percent }).catch(() => {});
        },
        dir,
      );
    } catch (err) {
      log(`  falhou: ${(err as Error).message}`);
      await withRetry('aviso de erro', () =>
        api('POST', `/api/worker/tracks/${job.id}/error`, { message: (err as Error).message }),
      );
      return;
    }

    const coverPath = path.join(dir, files.cover);
    if (existsSync(coverPath)) {
      const cover = await readFile(coverPath);
      await withRetry('envio da capa', () =>
        api('PUT', `/api/worker/tracks/${job.id}/cover`, cover, 'image/jpeg'),
      );
    }
    const audio = await readFile(path.join(dir, files.file));
    await withRetry('envio do áudio', () =>
      api('PUT', `/api/worker/tracks/${job.id}/audio`, audio, 'audio/mp4'),
    );
    log(`  pronta (${(audio.length / 1024 / 1024).toFixed(1)} MB)`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

log(`Worker conectando em ${SERVER_URL}`);
let backoff = 0;
let idleLogged = false;

while (true) {
  try {
    const job = await api<Job>('POST', '/api/worker/claim');
    backoff = 0;
    if (!job) {
      if (!idleLogged) log('Fila vazia, aguardando tarefas…');
      idleLogged = true;
      await sleep(IDLE_POLL_MS);
      continue;
    }
    idleLogged = false;
    if (job.type === 'import') await handleImport(job);
    else await handleTrack(job);
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
