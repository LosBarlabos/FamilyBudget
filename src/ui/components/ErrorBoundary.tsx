import { Component, useState, type ErrorInfo, type ReactNode } from 'react';
import { exportFileName } from '../../domain/exportFormat';
import { rawDump } from '../../db/repo';
import { errorText } from '../errors';
import { downloadFile, Icon } from './common';

interface Props {
  children: ReactNode;
  /** Ha megváltozik (pl. másik képernyőre lépés), a hibaképernyő eltűnik, és újra próbálkozik. */
  resetKey?: unknown;
}

interface State {
  error: Error | null;
  stack: string;
}

/** Megjelenítési hiba esetén fehér képernyő helyett „Hiba történt” oldal, vészmentéssel. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, stack: '' };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack);
    this.setState({ stack: info.componentStack ?? '' });
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null, stack: '' });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return <ErrorScreen error={this.state.error} stack={this.state.stack} />;
  }
}

function ErrorScreen({ error, stack }: { error: Error; stack: string }) {
  const [status, setStatus] = useState('');

  // Számolás nélküli, közvetlen táblamentés: akkor is működik, ha épp a számítás vagy a felület hibás.
  const download = async () => {
    try {
      const now = new Date();
      downloadFile(exportFileName(now, 'nyers'), JSON.stringify(await rawDump(now), null, 2), 'application/json');
      setStatus('A mentés letöltődött.');
    } catch (e) {
      setStatus(`A letöltés nem sikerült: ${errorText(e)}`);
    }
  };

  return (
    <div className="error-screen card" role="alert">
      <h1 style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <Icon name="alert-octagon" style={{ color: 'var(--color-danger)' }} /> Hiba történt
      </h1>
      <p className="muted mt-0">
        Az adatok a böngészőben megvannak. Mielőtt bármi mást próbálsz, töltsd le a nyers adatmentést: a Beállításokban
        ugyanúgy visszatölthető, mint egy normál mentés.
      </p>
      <div className="cluster wrap gap-2">
        <button className="btn primary" onClick={download}>
          <Icon name="download" /> Nyers adatmentés letöltése
        </button>
        <button className="btn" onClick={() => window.location.reload()}>
          <Icon name="refresh" /> Újratöltés
        </button>
      </div>
      {status && <div className="small mt-3">{status}</div>}
      <details className="mt-4">
        <summary className="small muted">A hiba részletei</summary>
        <pre className="error-details">
          {error.name}: {error.message}
          {stack}
        </pre>
      </details>
    </div>
  );
}
