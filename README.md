# MusicPlayer

PWA pessoal de músicas: cole a URL de um vídeo do YouTube (ou de outro site suportado pelo [yt-dlp](https://github.com/yt-dlp/yt-dlp)). O servidor baixa só o áudio em `.m4a` com capa e metadados, e você monta sua biblioteca e playlists.

## Estrutura

```
server/   API Fastify + SQLite (node:sqlite) + fila de downloads com yt-dlp
web/      PWA React + Vite (vite-plugin-pwa)
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

Produção (um processo só, servindo o PWA compilado):

```bash
npm run build
npm start        # http://localhost:3000
```

### Variáveis de ambiente (opcionais)

| Variável               | Padrão    | Descrição                                                  |
| ---------------------- | --------- | ---------------------------------------------------------- |
| `APP_PASSWORD`         | —         | Senha de acesso. Sem ela o login fica desligado            |
| `SESSION_SECRET`       | derivado  | Chave que assina o cookie de sessão                        |
| `TRUST_PROXY`          | `false`   | `true` atrás de Caddy/Nginx                                |
| `PORT`                 | `3000`    | Porta da API                                               |
| `HOST`                 | `0.0.0.0` | Interface de rede                                          |
| `DATA_DIR`             | `./data`  | Onde ficam o banco e os arquivos                           |
| `YTDLP_BIN`            | `yt-dlp`  | Caminho do executável do yt-dlp                            |
| `YTDLP_ARGS`           | —         | Opções extras do yt-dlp (pausas, cookies, runtime JS)      |
| `FFMPEG_DIR`           | —         | Pasta do ffmpeg, se não estiver no PATH                    |
| `DOWNLOAD_CONCURRENCY` | `2`       | Downloads simultâneos                                      |

## Deploy na VPS (Docker + Caddy)

Pré-requisitos: Docker com o plugin compose, as portas 80 e 443 livres e um domínio com registro **A** apontando para o IP da VPS.

```bash
git clone <seu-repo> musicplayer && cd musicplayer
cp .env.example .env    # defina DOMAIN e APP_PASSWORD
docker compose up -d --build
```

O Caddy emite o certificado HTTPS sozinho. Abra `https://seu-dominio` no celular, faça login e use **Adicionar à tela inicial** para instalar o app.

- **Atualizar o app:** `git pull && docker compose up -d --build`
- **Atualizar o yt-dlp:** `docker compose restart app` (ele se atualiza a cada start)
- **Logs:** `docker compose logs -f app`
- **Backup:** a pasta `data/`, que contém o banco e as músicas

**Se a VPS já tiver Nginx (ou outro serviço) nas portas 80/443:** remova o serviço `caddy` do compose, exponha `ports: ["127.0.0.1:3000:3000"]` no `app` e faça o proxy do seu Nginx para `127.0.0.1:3000`.

### Se o YouTube bloquear o IP da VPS

Se os downloads falharem com *"Sign in to confirm you're not a bot"*:

1. Exporte os cookies de uma conta **secundária** do YouTube (formato Netscape, com uma extensão como "Get cookies.txt LOCALLY").
2. Salve o arquivo como `data/cookies.txt`.
3. Use a linha `YTDLP_ARGS` com `--cookies` do `.env.example`.
4. Rode `docker compose up -d`.

Não use a sua conta principal: contas usadas por automação a partir de datacenter podem ser bloqueadas.

## API

| Método | Rota                                  | Descrição                           |
| ------ | ------------------------------------- | ----------------------------------- |
| GET    | `/api/tracks`                         | Lista a biblioteca                  |
| POST   | `/api/import` `{ url }`               | Vídeo → faixa; playlist → playlist com todas as faixas (reimportar sincroniza) |
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
