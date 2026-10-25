import { api, type Track } from './api';

// Reproduções feitas sem internet (academia) ficam guardadas no aparelho e vão para o
// servidor quando a conexão volta, com o horário em que foram ouvidas.
const PENDING_KEY = 'pending-plays';

type PendingPlay = { id: number; playedAt: string };

function readPending(): PendingPlay[] {
  try {
    return JSON.parse(localStorage.getItem(PENDING_KEY) ?? '[]') as PendingPlay[];
  } catch {
    return [];
  }
}

function writePending(list: PendingPlay[]) {
  try {
    if (list.length) localStorage.setItem(PENDING_KEY, JSON.stringify(list.slice(-500)));
    else localStorage.removeItem(PENDING_KEY);
  } catch {
    // armazenamento indisponível: a reprodução não entra no histórico
  }
}

async function send(play: PendingPlay) {
  try {
    await api.recordPlay(play.id, play.playedAt);
  } catch {
    writePending([...readPending(), play]);
  }
}

export function recordPlay(trackId: number) {
  void send({ id: trackId, playedAt: new Date().toISOString() });
}

export async function flushPendingPlays() {
  const pending = readPending();
  if (!pending.length) return;
  writePending([]);
  for (const play of pending) await send(play);
}

/** Avisa as telas que a lista de favoritas mudou (biblioteca, listas automáticas). */
export const FAVORITES_CHANGED = 'favorites-changed';

export async function setFavorite(track: Track, favorite: boolean): Promise<Track> {
  const updated = await api.setFavorite(track.id, favorite);
  window.dispatchEvent(new Event(FAVORITES_CHANGED));
  return updated;
}
