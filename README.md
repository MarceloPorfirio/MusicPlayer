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

### Se o YouTube bloquear o IP da VPS

Se os downloads falharem com *"Sign in to confirm you're not a bot"*:

1. Exporte os cookies de uma conta **secundária** do YouTube (formato Netscape, com uma extensão como "Get cookies.txt LOCALLY").
2. Coloque o arquivo em `cookies.txt` dentro do volume de `/app/data`.
3. Troque o `YTDLP_ARGS` no Coolify pela versão com `--cookies` do `.env.example`.
4. Reinicie o container.

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
