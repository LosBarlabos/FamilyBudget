import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import '@tabler/icons-webfont/dist/tabler-icons.min.css';
import './styles.css';
import { App } from './ui/App';
import { ErrorBoundary } from './ui/components/ErrorBoundary';
import { db } from './db/db';

registerSW({ immediate: true });

// Csak fejlesztéskor: az adatbázis elérhető a konzolból hibakereséshez és próbaadatokhoz.
if (import.meta.env.DEV) Object.assign(window, { db });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
