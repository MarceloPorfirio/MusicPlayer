FROM node:24-slim

# ffmpeg para extrair o áudio; yt-dlp como binário standalone (não precisa de Python)
ARG TARGETARCH
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates curl \
 && rm -rf /var/lib/apt/lists/* \
 && url=https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux \
 && if [ "$TARGETARCH" = "arm64" ]; then url="${url}_aarch64"; fi \
 && curl -fsSL -o /usr/local/bin/yt-dlp "$url" \
 && chmod +x /usr/local/bin/yt-dlp

WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production \
    DATA_DIR=/app/data \
    PORT=3000
EXPOSE 3000

# Atualiza o yt-dlp a cada start: o YouTube muda com frequência.
CMD ["sh", "-c", "yt-dlp -U || true; exec npm start"]
