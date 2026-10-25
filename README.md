# Pulse

PWA pessoal de músicas: cole a URL de um vídeo do YouTube (ou de outro site suportado pelo [yt-dlp](https://github.com/yt-dlp/yt-dlp)). O servidor baixa só o áudio em `.m4a` com capa e metadados, e você monta sua biblioteca e playlists.

## Estrutura

```
server/   API Fastify + SQLite (node:sqlite) + fila de downloads com yt-dlp
web/      PWA React + Vite (vite-plugin-pwa)
worker/   worker de downloads para rodar num PC em casa quando o servidor está numa VPS
scripts/  inicialização automática do worker no Windows
data/     criado na 1ª execução: library.db e media/ (áudios e capas) — fora do git
```

## Requisitos

- Node.js 22.13+ (usa o `node:sqlite` nativo)
- `yt-dlp` e `ffmpeg` no PATH. No Windows:

  ```powershell
  winget install yt-dlp.yt-dlp   # já instala o ffmpeg como dependência
  ```

  Mantenha o yt-dlp atualizado (`winget upgrade yt-dlp.yt-dlp`): o YouTube muda com frequência e versões antigas param de funcionar.

## Rodando

```bash
npm install
npm run dev      # API em :3000 + Vite em :5173 (com proxy de /api)
```

O service worker (cache offline e "Baixar no aparelho" tocando sem rede) só roda no build de produção. Para testar o modo offline, use `npm run build && npm start`.

Produção (um processo só, servindo o PWA compilado):

```bash
npm run build
npm start        # http://localhost:3000
```

Ou com a imagem Docker de produção: `docker compose up --build` (também em `http://localhost:3000`).

### Variáveis de ambiente (opcionais)

| Variável               | Padrão    | Descrição                                                  |
| ---------------------- | --------- | ---------------------------------------------------------- |
| `APP_PASSWORD`         | —         | Senha de acesso. Sem ela o login fica desligado            |
| `DOWNLOAD_MODE`        | `local`   | `worker`: o servidor não acessa o YouTube (ver abaixo)     |
| `WORKER_TOKEN`         | —         | Token do worker; sem ele as rotas `/api/worker/*` ficam fechadas |
| `SESSION_SECRET`       | derivado  | Chave que assina o cookie de sessão                        |
| `TRUST_PROXY`          | `false`   | `true` atrás de proxy reverso (já vem `true` na imagem)    |
| `PORT`                 | `3000`    | Porta da API                                               |
| `HOST`                 | `0.0.0.0` | Interface de rede                                          |
| `DATA_DIR`             | `./data`  | Onde ficam o banco e os arquivos                           |
| `YTDLP_BIN`            | `yt-dlp`  | Caminho do executável do yt-dlp                            |
| `YTDLP_ARGS`           | —         | Opções extras do yt-dlp (pausas, cookies, runtime JS)      |
| `FFMPEG_DIR`           | —         | Pasta do ffmpeg, se não estiver no PATH                    |
| `DOWNLOAD_CONCURRENCY` | `2`       | Downloads simultâneos                                      |

## Deploy na VPS (Coolify)

O deploy segue o padrão da VPS: **o build nunca roda na VPS**. A cada push na `main`, o GitHub Actions ([.github/workflows/deploy.yml](.github/workflows/deploy.yml)) constrói a imagem, publica em `ghcr.io/<dono>/<repo>` (tags `latest` e `sha-xxxxxxx`) e pede o deploy ao Coolify. O Coolify puxa a `latest`, e o Traefik dele cuida do domínio e do HTTPS.

### Primeira vez

1. **Publique a imagem:** faça o push na `main`. Sem `COOLIFY_APP_UUID` configurado, o workflow só publica e pula o deploy. Se o repositório for privado, o pacote no GHCR também é, e o Coolify vai precisar de credencial do registry (um token do GitHub com `read:packages`).
2. **DNS:** crie um registro **A** do subdomínio (ex.: `music`) para o IP da VPS. No Cloudflare, use **DNS only** (nuvem cinza): com o proxy laranja, a renovação do certificado trava.
3. **Coolify:** crie um recurso do tipo **Docker Image** com:
   - **Imagem:** `ghcr.io/<dono>/<repo>:latest`
   - **Porta:** `3000`
   - **Domínio:** `https://music.seudominio.com.br`
   - **Persistent Storage:** um **volume** montado em `/app/data`. É onde ficam o banco e as músicas, e sem ele tudo some a cada deploy.
   - **Environment Variables:** as do [.env.example](.env.example), com `APP_PASSWORD` forte
   - **Nome do container:** único e explícito, nunca `app` ou `web`
4. **GitHub** (Settings › Secrets and variables › Actions):
   - **variables:** `COOLIFY_URL`, `COOLIFY_APP_UUID`, `APP_URL`
   - **secret:** `COOLIFY_TOKEN`
5. Rode o workflow de novo (aba Actions › Deploy › Run workflow). Ele espera o Coolify terminar e confere se `APP_URL/api/session` responde 200.

Depois, abra o domínio no celular, faça login e use **Adicionar à tela inicial** para instalar o app.

### Rotina

- **Atualizar o app:** é só dar push na `main`.
- **Rollback:** no Coolify, aponte a imagem para uma tag `sha-xxxxxxx` anterior e faça o deploy.
- **Atualizar o yt-dlp:** reinicie o container, porque ele se atualiza a cada start.
- **Backup:** o volume de `/app/data`. O `library.db` é pequeno e é o que importa, porque as músicas podem ser baixadas de novo. O backup do Coolify cobre só bancos gerenciados por ele, não este SQLite.

### Downloads pelo worker (IP de casa)

O YouTube bloqueia IP de datacenter (*"Sign in to confirm you're not a bot"*). Por isso, na VPS, o servidor roda com `DOWNLOAD_MODE=worker` e **nunca acessa o YouTube**. Ao colar uma URL, ela entra numa fila, e um worker no seu PC, com IP residencial, busca as informações, baixa as músicas e envia áudio e capa para a VPS. Ouvir não depende do PC: só baixar músicas novas.

```
celular/PC ──URL──▶ VPS (fila) ◀──pede tarefa── worker no PC ──yt-dlp──▶ YouTube
                    VPS ◀──────── áudio + capa ── worker
```

**Configuração:**

1. Gere um token: `openssl rand -hex 32`
2. **No Coolify:** adicione `DOWNLOAD_MODE=worker` e `WORKER_TOKEN=<token>` e faça o redeploy.
3. **No PC:** copie `worker.env.example` para `worker.env` e preencha `SERVER_URL` e o mesmo `WORKER_TOKEN`. O PC precisa de `yt-dlp` e `ffmpeg` (ver Requisitos).
4. Teste com `npm run worker`.
5. Para iniciar escondido com o Windows: `powershell -ExecutionPolicy Bypass -File scripts\worker-autostart.ps1`. O log fica em `worker.log`. Para desfazer, rode o mesmo comando com `-Remove`.

**Detalhes:**

- **Um worker por vez.** A cada pedido de tarefa, o servidor devolve para a fila o que tinha ficado "em andamento" (PC desligado no meio, upload que falhou). Dois workers simultâneos tomariam a tarefa um do outro.
- **No app:** um aviso mostra se o PC está conectado e quantas músicas e URLs estão aguardando.

## API

| Método | Rota                                  | Descrição                           |
| ------ | ------------------------------------- | ----------------------------------- |
| GET    | `/api/tracks`                         | Lista a biblioteca                  |
| GET    | `/api/status`                         | Modo de download, worker conectado, itens aguardando |
| GET    | `/api/imports`                        | URLs aguardando o worker (modo worker) |
| POST   | `/api/search` `{ q }`                 | Busca no YouTube (no modo worker, quem busca é o PC; acompanhe por `GET /api/search/:id`) |
| POST   | `/api/search/:id/add` `{ videoId }`   | Adiciona um resultado da busca à biblioteca |
| POST   | `/api/import` `{ url }`               | Vídeo → faixa; playlist → playlist com todas as faixas (reimportar sincroniza). No modo worker, só enfileira (202) |
| PATCH  | `/api/tracks/:id`                     | Edita título/artista/álbum          |
| POST   | `/api/tracks/:id/retry`               | Tenta baixar de novo                |
| DELETE | `/api/tracks/:id`                     | Remove faixa e arquivos             |
| GET    | `/api/tracks/:id/audio` / `cover`     | Stream do áudio (com Range) / capa  |
| GET    | `/api/playlists`                      | Lista playlists                     |
| POST   | `/api/playlists` `{ name }`           | Cria playlist                       |
| GET    | `/api/playlists/:id`                  | Playlist com faixas                 |
| PATCH  | `/api/playlists/:id` `{ name }`       | Renomeia                            |
| DELETE | `/api/playlists/:id`                  | Apaga (as faixas ficam)             |
| POST   | `/api/playlists/:id/tracks` `{ trackId }` | Adiciona faixa                  |
| PUT    | `/api/playlists/:id/tracks` `{ trackIds }` | Reordena                       |
| DELETE | `/api/playlists/:id/tracks/:trackId`  | Remove faixa da playlist            |

> Uso pessoal. Baixar conteúdo do YouTube vai contra os termos de uso da plataforma, e redistribuir músicas protegidas infringe direitos autorais. Não exponha este servidor publicamente.
