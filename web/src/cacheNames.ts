// Compartilhado entre o app e o service worker.

/** Áudios baixados no aparelho pelo usuário (nunca expiram sozinhos). */
export const OFFLINE_AUDIO_CACHE = 'offline-audio';
export const COVERS_CACHE = 'covers';
/** Última resposta das listas da API, para abrir o app sem rede. */
export const API_CACHE = 'api';
