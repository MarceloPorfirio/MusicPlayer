// Worker de downloads: roda num PC com IP residencial (que o YouTube não bloqueia),
// pega tarefas do servidor (DOWNLOAD_MODE=worker), baixa com o yt-dlp e envia o resultado.
//
//   npm run worker      (configuração em worker.env, na raiz do projeto)
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const envFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../worker.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

// Import dinâmico: a configuração do yt-dlp (YTDLP_ARGS etc.) é lida no import,
// então precisa vir depois de carregar o worker.env.
await import('./run.js');
