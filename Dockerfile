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
    PORT=3000 \
    TRUST_PROXY=true
EXPOSE 3000

# /api/session é pública e não depende de download nenhum: 200 = servidor de pé.
# start-period cobre o `yt-dlp -U` do start, que leva alguns segundos.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/session').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"

# Atualiza o yt-dlp a cada start: o YouTube muda com frequência.
CMD ["sh", "-c", "yt-dlp -U || true; exec npm start"]
