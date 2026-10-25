import { createContext, useContext } from 'react';
import type { ServerStatus } from './api';

/** Status do servidor (modo de download e worker), carregado pelo App junto com a biblioteca. */
export const StatusContext = createContext<ServerStatus | null>(null);

export function useServerStatus() {
  return useContext(StatusContext);
}

/** No modo worker, quem baixa é o PC: as faixas pendentes estão esperando por ele. */
export function pendingLabel(status: ServerStatus | null) {
  return status?.downloadMode === 'worker' ? 'Aguardando o PC…' : 'Na fila…';
}
