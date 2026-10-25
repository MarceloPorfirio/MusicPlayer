import { useEffect, useRef, useState } from 'react';

const CHECK_INTERVAL_MS = 30 * 60 * 1000;

/**
 * Versão nova publicada: o service worker novo assume a página (skipWaiting + clientsClaim),
 * mas o JavaScript em execução continua sendo o antigo até recarregar. Recarrega sozinho se
 * nada estiver tocando; com música tocando, devolve `true` para o app oferecer o botão.
 */
export function useAppUpdate(playing: boolean) {
  const [pending, setPending] = useState(false);
  const playingRef = useRef(playing);
  playingRef.current = playing;

  useEffect(() => {
    const sw = navigator.serviceWorker;
    // Sem controlador = primeira visita; o SW assumir agora não significa versão nova.
    if (!sw?.controller) return;

    const onControllerChange = () => {
      if (playingRef.current) setPending(true);
      else window.location.reload();
    };
    sw.addEventListener('controllerchange', onControllerChange);

    // O navegador só procura SW novo ao navegar; um PWA aberto há horas nunca navega.
    const check = () => sw.getRegistration().then((r) => r?.update()).catch(() => {});
    const onVisible = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(check, CHECK_INTERVAL_MS);

    return () => {
      sw.removeEventListener('controllerchange', onControllerChange);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    };
  }, []);

  return pending;
}
