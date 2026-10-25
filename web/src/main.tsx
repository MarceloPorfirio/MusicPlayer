import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { AuthGate } from './components/AuthGate';
import { OfflineProvider } from './offline';
import { PlayerProvider } from './player';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthGate>
      {(logout) => (
        <OfflineProvider>
          <PlayerProvider>
            <App onLogout={logout} />
          </PlayerProvider>
        </OfflineProvider>
      )}
    </AuthGate>
  </StrictMode>,
);
