import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { api } from '../api';
import { API_CACHE } from '../cacheNames';

type State = 'loading' | 'login' | 'ok';

interface Props {
  /** Recebe `logout`, ou undefined quando o servidor não exige senha. */
  children: (logout?: () => void) => ReactNode;
}

export function AuthGate({ children }: Props) {
  const [state, setState] = useState<State>('loading');
  const [required, setRequired] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .session()
      .then((s) => {
        setRequired(s.required);
        setState(s.authenticated ? 'ok' : 'login');
      })
      .catch(() => setState('login'));

    const onUnauthorized = () => setState('login');
    window.addEventListener('unauthorized', onUnauthorized);
    return () => window.removeEventListener('unauthorized', onUnauthorized);
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    // Remove a cópia offline das listas; os áudios baixados continuam no aparelho.
    if (typeof caches !== 'undefined') await caches.delete(API_CACHE);
    setState('login');
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login(password);
      setPassword('');
      setState('ok');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (state === 'loading') return null;
  if (state === 'ok') return children(required ? logout : undefined);

  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <img src="/icon.svg" alt="" width={64} height={64} />
        <h1>Pulse</h1>
        <input
          type="password"
          placeholder="Senha"
          autoComplete="current-password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
        />
        <button className="btn primary" disabled={busy || !password}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
        {error && <p className="error">{error}</p>}
      </form>
    </div>
  );
}
