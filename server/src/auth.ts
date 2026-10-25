import { createHash, timingSafeEqual } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import fastifyCookie from '@fastify/cookie';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { APP_PASSWORD, SESSION_SECRET } from './config.js';

const COOKIE = 'session';
const MAX_AGE = 60 * 60 * 24 * 365; // 1 ano

const sha256 = (value: string) => createHash('sha256').update(value).digest();

// O conteúdo do cookie depende da senha: trocar a senha derruba as sessões antigas.
const sessionValue = APP_PASSWORD ? sha256(`session:${APP_PASSWORD}`).toString('hex') : '';

function passwordMatches(password: string) {
  return timingSafeEqual(sha256(password), sha256(APP_PASSWORD!));
}

function isAuthenticated(req: FastifyRequest) {
  if (!APP_PASSWORD) return true;
  const raw = req.cookies[COOKIE];
  if (!raw) return false;
  const { valid, value } = req.unsignCookie(raw);
  return valid && value === sessionValue;
}

const PUBLIC_ROUTES = new Set(['/api/session', '/api/login', '/api/logout']);

/** Senha única + cookie assinado. Registrar no app raiz, antes das rotas. */
export async function setupAuth(app: FastifyInstance) {
  await app.register(fastifyCookie, {
    secret: SESSION_SECRET ?? sha256(`secret:${APP_PASSWORD ?? ''}`).toString('hex'),
  });

  app.addHook('onRequest', async (req, reply) => {
    const path = req.url.split('?')[0];
    // /api/worker/* usa o próprio token (ver routes/worker.ts), não a sessão.
    if (!path.startsWith('/api/') || PUBLIC_ROUTES.has(path) || path.startsWith('/api/worker/')) return;
    if (!isAuthenticated(req)) return reply.code(401).send({ error: 'Faça login.' });
  });

  app.get('/api/session', async (req) => ({
    authenticated: isAuthenticated(req),
    required: Boolean(APP_PASSWORD),
  }));

  app.post<{ Body: { password?: string } }>('/api/login', async (req, reply) => {
    if (!APP_PASSWORD) return { authenticated: true };
    if (!passwordMatches(req.body?.password ?? '')) {
      await sleep(1000); // freia tentativas de força bruta
      return reply.code(401).send({ error: 'Senha incorreta.' });
    }
    reply.setCookie(COOKIE, sessionValue, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: 'auto',
      signed: true,
      maxAge: MAX_AGE,
    });
    return { authenticated: true };
  });

  app.post('/api/logout', async (_req, reply) => {
    reply.clearCookie(COOKIE, { path: '/' });
    return { authenticated: false };
  });
}
