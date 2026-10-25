import { existsSync } from 'node:fs';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { setupAuth } from './auth.js';
import { APP_PASSWORD, HOST, MEDIA_DIR, PORT, TRUST_PROXY, WEB_DIST } from './config.js';
import { resumePending } from './downloads.js';
import { playlistRoutes } from './routes/playlists.js';
import { trackRoutes } from './routes/tracks.js';

const app = Fastify({ logger: { level: 'info' }, trustProxy: TRUST_PROXY });

if (!APP_PASSWORD) app.log.warn('APP_PASSWORD não definido: login desligado (ok só para uso local).');
await setupAuth(app);

// Em produção o servidor também entrega o PWA compilado (web/dist).
// Em dev o Vite serve o front e faz proxy de /api para cá.
const serveWeb = existsSync(WEB_DIST);
await app.register(fastifyStatic, {
  root: serveWeb ? WEB_DIST : MEDIA_DIR,
  serve: serveWeb,
});

await app.register(trackRoutes);
await app.register(playlistRoutes);

app.setNotFoundHandler((req, reply) => {
  if (serveWeb && req.method === 'GET' && !req.url.startsWith('/api/')) {
    return reply.sendFile('index.html');
  }
  return reply.code(404).send({ error: 'Não encontrado.' });
});

resumePending();
await app.listen({ port: PORT, host: HOST });
