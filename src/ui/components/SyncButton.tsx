import { useEffect } from 'react';
import { syncNow, useSyncConfig, useSyncState, type SyncState } from '../../sync/engine';
import { Icon } from './common';

/** Ennyi idő után kérdezi le magától a másik eszköz változásait, amíg az app előtérben van. */
const POLL_MS = 60_000;
/** Helyi módosítás után ennyit vár a feltöltéssel, hogy egy sorozat rögzítés egy körben menjen fel. */
const PUSH_DELAY_MS = 1500;

function timeText(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60_000);
  if (mins < 1) return 'most';
  const time = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  return d.toDateString() === new Date().toDateString() ? time : `${d.toLocaleDateString('hu-HU', { month: 'short', day: 'numeric' })} ${time}`;
}

/** A szinkron állapota egy rövid mondatban (fejléc, Beállítások). */
export function syncLabel(st: SyncState): string {
  if (st.status === 'syncing') return 'Szinkronizálás…';
  if (st.status === 'error') return 'Szinkronhiba';
  if (st.status === 'offline') return st.pending ? 'Offline · feltöltésre vár' : 'Offline';
  if (st.pending) return 'Feltöltésre vár';
  return st.lastSyncAt ? `Szinkronizálva ${timeText(st.lastSyncAt)}` : 'Szinkron bekapcsolva';
}

/**
 * Automatikus szinkron: induláskor, előtérbe kerüléskor, a hálózat visszatérésekor, percenként (előtérben),
 * és minden helyi módosítás után kis késleltetéssel.
 */
export function useAutoSync(data: unknown) {
  const cfg = useSyncConfig();
  const on = !!cfg;
  useEffect(() => {
    if (!on) return;
    const visible = () => document.visibilityState === 'visible';
    const run = () => visible() && void syncNow();
    void syncNow();
    document.addEventListener('visibilitychange', run);
    window.addEventListener('online', run);
    const t = window.setInterval(run, POLL_MS);
    return () => {
      document.removeEventListener('visibilitychange', run);
      window.removeEventListener('online', run);
      window.clearInterval(t);
    };
  }, [on, cfg?.repo, cfg?.path, cfg?.token]);
  useEffect(() => {
    if (!on) return;
    const t = window.setTimeout(() => void syncNow({ localChange: true }), PUSH_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [on, data]);
}

/** A fejléc szinkronjelzője: kattintásra azonnal szinkronizál, hibánál a Beállításokba visz. */
export function SyncButton({ onOpenSettings }: { onOpenSettings: () => void }) {
  const st = useSyncState();
  const label = syncLabel(st);
  const icon =
    st.status === 'syncing' ? 'refresh' : st.status === 'error' ? 'cloud-x' : st.status === 'offline' || st.pending ? 'cloud-upload' : 'cloud-check';
  const tone = st.status === 'error' ? 'error' : st.status === 'offline' || st.pending ? 'pending' : '';
  const title = st.status === 'error' && st.error ? `${label}: ${st.error}` : label;
  return (
    <button
      className={`btn sm backup sync ${tone} ${st.status === 'syncing' ? 'spinning' : ''}`}
      title={title}
      aria-label={title}
      onClick={() => (st.status === 'error' ? onOpenSettings() : void syncNow())}
    >
      <Icon name={icon} /> <span className="backup-label">{label}</span>
    </button>
  );
}
