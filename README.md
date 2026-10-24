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

| Variável               | Padrão    | Descrição                                 |
| ---------------------- | --------- | ----------------------------------------- |
| `PORT`                 | `3000`    | Porta da API                              |
| `HOST`                 | `0.0.0.0` | Interface de rede                         |
| `DATA_DIR`             | `./data`  | Onde ficam o banco e os arquivos          |
| `YTDLP_BIN`            | `yt-dlp`  | Caminho do executável do yt-dlp           |
| `FFMPEG_DIR`           | —         | Pasta do ffmpeg, se não estiver no PATH   |
| `DOWNLOAD_CONCURRENCY` | `2`       | Downloads simultâneos                     |

## Usando no celular

O service worker (e, portanto, instalar como app) só funciona em `localhost` ou **HTTPS**. Para abrir pelo celular, a forma mais simples é o [Tailscale](https://tailscale.com/): instale no PC e no celular e rode `tailscale serve 3000`. Isso dá uma URL HTTPS privada, que funciona também fora de casa.

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
