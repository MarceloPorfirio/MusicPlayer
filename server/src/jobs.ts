import { EventEmitter } from 'node:events';

/**
 * Avisa o worker (em long-polling no /api/worker/claim) que surgiu trabalho novo,
 * para ele não esperar o próximo ciclo.
 */
const signal = new EventEmitter();
signal.setMaxListeners(0);

export function notifyWorker() {
  signal.emit('job');
}

/** Resolve quando surgir trabalho, quando passar `ms`, ou quando `abort` disparar. */
export function waitForJob(ms: number, abort: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      signal.off('job', done);
      abort.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.once('job', done);
    abort.addEventListener('abort', done, { once: true });
  });
}
