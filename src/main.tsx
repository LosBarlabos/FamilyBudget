import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import '@tabler/icons-webfont/dist/tabler-icons.min.css';
import './fonts.css';
import './tokens.css';
import './styles.css';
import { App } from './ui/App';
import { ErrorBoundary } from './ui/components/ErrorBoundary';
import { db } from './db/db';
import { SAMPLE } from './db/sampleMode';

registerSW({ immediate: true });

// Csak fejlesztéskor: az adatbázis elérhető a konzolból hibakereséshez és próbaadatokhoz.
if (import.meta.env.DEV) Object.assign(window, { db });

// Csak fejlesztéskor: a ?minta paraméter a megjelenítés előtt betölti a mintaadatot (lásd sampleMode).
const sample = import.meta.env.DEV && SAMPLE.load
  ? import('./ui/sample').then((m) => m.loadSample(SAMPLE.load!)).catch((e) => console.error('A minta betöltése nem sikerült', e))
  : Promise.resolve();

sample.finally(() =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  ),
);
