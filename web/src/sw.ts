/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { ExpirationPlugin } from 'workbox-expiration';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { createPartialResponse } from 'workbox-range-requests';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst } from 'workbox-strategies';
import { API_CACHE, COVERS_CACHE, OFFLINE_AUDIO_CACHE } from './cacheNames';

declare let self: ServiceWorkerGlobalScope;

self.skipWaiting();
clientsClaim();

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/^\/api\//] }));

// Áudio: se foi baixado no aparelho, sai do cache (respeitando Range para o seek); senão, rede.
registerRoute(
  ({ url }) => /^\/api\/tracks\/\d+\/audio$/.test(url.pathname),
  async ({ request }) => {
    const cache = await caches.open(OFFLINE_AUDIO_CACHE);
    const cached = await cache.match(request.url);
    if (!cached) return fetch(request);
    return request.headers.has('range') ? createPartialResponse(request, cached) : cached;
  },
);

registerRoute(
  ({ url }) => /^\/api\/tracks\/\d+\/cover$/.test(url.pathname),
  new CacheFirst({
    cacheName: COVERS_CACHE,
    plugins: [new ExpirationPlugin({ maxEntries: 2000 })],
  }),
);

// Listas (biblioteca, playlists, sessão): rede primeiro; sem rede ou rede lenta, última cópia.
registerRoute(
  ({ url, request }) =>
    request.method === 'GET' &&
    /^\/api\/(session|tracks|playlists(\/\d+)?)$/.test(url.pathname),
  new NetworkFirst({ cacheName: API_CACHE, networkTimeoutSeconds: 3 }),
);
