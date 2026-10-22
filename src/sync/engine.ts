// Közös használat GitHubon: az eszköz a helyi adatbázisban dolgozik (internet nélkül is), és időnként egy
// privát tároló közös fájljával fésüli össze. A beállítás (tároló, token, név) eszközönként a localStorage-ban,
// a legutóbbi közös állapot (az összefésülés alapja) az IndexedDB-ben van.

import { useSyncExternalStore } from 'react';
import { db } from '../db/db';
import { loadAll, setEntryAuthor } from '../db/repo';
import { buildExport, parseImport } from '../domain/exportFormat';
import { missingBasePlans } from '../domain/plans';
import { changeSummary, LOCAL_SETTINGS_FIELDS, mergeData, sameData } from '../domain/sync';
import type { BudgetData, Settings } from '../domain/types';
import { readLocal, subscribeLocal, writeLocal } from '../ui/localStore';
import { checkRepo, readFile, SyncError, writeFile, type RepoConfig } from './github';

export interface SyncConfig extends RepoConfig {
  /** Ezen a néven jelennek meg az eszközről rögzített tételek. */
  name: string;
}

export type SyncStatus = 'off' | 'idle' | 'syncing' | 'offline' | 'error';

export interface SyncState {
  status: SyncStatus;
  /** A legutóbbi sikeres szinkron ideje (ISO). */
  lastSyncAt: string | null;
  error: string | null;
  /** Van-e helyi változás, ami még nem jutott fel. */
  pending: boolean;
}

const CONFIG_KEY = 'sync-config';
/** Ennyiszer próbál újra, ha közben a másik eszköz írt. */
const MAX_ATTEMPTS = 5;

export const getSyncConfig = () => readLocal<SyncConfig | null>(CONFIG_KEY, null);

export function useSyncConfig(): SyncConfig | null {
  return useSyncExternalStore((f) => subscribeLocal(CONFIG_KEY, f), getSyncConfig);
}

setEntryAuthor(getSyncConfig()?.name);

let state: SyncState = { status: getSyncConfig() ? 'idle' : 'off', lastSyncAt: null, error: null, pending: false };
const listeners = new Set<() => void>();
function setState(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  listeners.forEach((f) => f());
}

export function useSyncState(): SyncState {
  return useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    () => state,
  );
}

// Az utolsó szinkron ideje az újraindítás után is látszódjon.
db.syncMeta
  .get('base')
  .then((m) => m && setState({ lastSyncAt: m.at }))
  .catch(() => {});

async function readLocalData(): Promise<BudgetData | null> {
  const d = await loadAll();
  return d.settings ? { ...d, settings: d.settings } : null;
}

function toData(text: string): BudgetData {
  let f;
  try {
    f = parseImport(text);
  } catch (e) {
    throw new SyncError('other', `A közös fájl hibás: ${(e as Error).message}`);
  }
  return { settings: f.settings, categories: f.categories, plans: f.plans, entries: f.entries, overrides: f.periodOverrides };
}

const toText = (d: BudgetData) => JSON.stringify(buildExport(d), null, 2);

const localOnly = (s: Settings | undefined): Partial<Settings> =>
  Object.fromEntries(LOCAL_SETTINGS_FIELDS.filter((f) => s?.[f] !== undefined).map((f) => [f, s![f]]));

/**
 * A helyi adatbázis cseréje az összefésült változatra, de csak ha közben (a hálózati kérés alatt) nem
 * rögzítettek újat: ilyenkor false, és a szinkron elölről kezdi, hogy az új rögzítés ne vesszen el.
 */
async function replaceLocal(expected: BudgetData | null, next: BudgetData): Promise<boolean> {
  return db.transaction('rw', [db.settings, db.categories, db.plans, db.entries, db.periodOverrides], async () => {
    const [settings, categories, plans, entries, overrides] = await Promise.all([
      db.settings.get('settings'), db.categories.toArray(), db.plans.toArray(), db.entries.toArray(), db.periodOverrides.toArray(),
    ]);
    const current = settings ? { settings, categories, plans, entries, overrides } : null;
    if (expected ? !current || !sameData(current, expected) : current) return false;
    await Promise.all([db.settings.clear(), db.categories.clear(), db.plans.clear(), db.entries.clear(), db.periodOverrides.clear()]);
    await db.settings.put({ ...next.settings, ...localOnly(settings), id: 'settings' });
    await db.categories.bulkPut(next.categories);
    await db.plans.bulkPut([...next.plans, ...missingBasePlans(next.categories, next.plans, next.settings.firstPeriodId)]);
    await db.entries.bulkPut(next.entries);
    await db.periodOverrides.bulkPut(next.overrides);
    return true;
  });
}

async function saveBase(data: BudgetData, sha: string) {
  const at = new Date().toISOString();
  await db.syncMeta.put({ key: 'base', data, sha, at });
  setState({ lastSyncAt: at, pending: false });
}

let running: Promise<void> | null = null;
let again = false;

/**
 * Egy szinkron kör: letölti a közös fájlt, összefésüli a helyivel, és ha kell, mindkét oldalt frissíti.
 * Futó kör közben a kérés nem indít párhuzamosat, hanem a végén még egyszer lefut. A `localChange` jelzésű
 * kérés (helyi módosítás után) hálózat nélkül is véget ér, ha nincs mit feltölteni.
 */
export function syncNow(opts: { localChange?: boolean } = {}): Promise<void> {
  if (!getSyncConfig()) return Promise.resolve();
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      let localChange = opts.localChange ?? false;
      do {
        again = false;
        await syncOnce(localChange);
        // A közben kért kör teljes szinkron: lehet, hogy a másik eszköz változását kell lehozni.
        localChange = false;
      } while (again);
    } finally {
      running = null;
    }
  })();
  return running;
}

async function syncOnce(localChange: boolean) {
  const cfg = getSyncConfig();
  if (!cfg) return;
  const meta = await db.syncMeta.get('base');
  const first = await readLocalData();
  if (!first) return;
  const pending = !meta || !sameData(first, meta.data);
  setState({ pending });
  if (localChange && !pending) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    setState({ status: 'offline', error: null });
    return;
  }

  setState({ status: 'syncing', error: null });
  try {
    let done = false;
    for (let attempt = 0; attempt < MAX_ATTEMPTS && !done; attempt++) {
      const local = await readLocalData();
      if (!local) return;
      const base = (await db.syncMeta.get('base'))?.data ?? null;
      const remote = await readFile(cfg);
      if (!remote) {
        // A közös fájlt valaki törölte: az itteni állapot lesz az új közös.
        const sha = await writeFile(cfg, toText(local), null, changeSummary(null, local, cfg.name));
        await saveBase(local, sha);
        done = true;
        break;
      }
      const remoteData = toData(remote.text);
      const merged = mergeData(base, local, remoteData);
      if (!sameData(merged, local) && !(await replaceLocal(local, merged))) continue;
      try {
        const sha = sameData(merged, remoteData)
          ? remote.sha
          : await writeFile(cfg, toText(merged), remote.sha, changeSummary(remoteData, merged, cfg.name));
        await saveBase(merged, sha);
        done = true;
      } catch (e) {
        if (e instanceof SyncError && e.kind === 'conflict') continue;
        throw e;
      }
    }
    if (!done) throw new SyncError('conflict', 'A közös fájl túl gyakran változott, a szinkron később újra próbálkozik.');
    setState({ status: 'idle', error: null });
  } catch (e) {
    const err = e instanceof SyncError ? e : new SyncError('other', (e as Error).message);
    setState(err.kind === 'network' ? { status: 'offline', error: null } : { status: 'error', error: err.message });
  }
}

/** A bekapcsolás első lépése: a tároló ellenőrzése, és ha van már közös költségvetés, annak összefoglalója. */
export async function probe(cfg: RepoConfig): Promise<{ remote: BudgetData | null }> {
  await checkRepo(cfg);
  const f = await readFile(cfg);
  return { remote: f ? toData(f.text) : null };
}

/**
 * Bekapcsolás. 'download': a közös költségvetés kerül erre az eszközre (az itteni helyére);
 * 'upload': az itteni adat lesz a közös (a tárolóban lévőt felülírja).
 */
export async function connect(cfg: SyncConfig, mode: 'download' | 'upload') {
  await checkRepo(cfg);
  const remote = await readFile(cfg);
  if (mode === 'download') {
    if (!remote) throw new SyncError('notFound', 'A tárolóban még nincs közös költségvetés.');
    const data = toData(remote.text);
    if (!(await replaceLocal(await readLocalData(), data))) throw new SyncError('other', 'Közben módosultak az adatok, próbáld újra.');
    await saveBase(data, remote.sha);
  } else {
    const local = await readLocalData();
    if (!local) throw new SyncError('other', 'Ezen az eszközön még nincs költségvetés.');
    const sha = await writeFile(cfg, toText(local), remote?.sha ?? null, changeSummary(null, local, cfg.name));
    await saveBase(local, sha);
  }
  writeLocal<SyncConfig | null>(CONFIG_KEY, null, cfg);
  setEntryAuthor(cfg.name);
  setState({ status: 'idle', error: null });
}

/** A név módosítása (a token és a tároló marad). */
export function renameDevice(name: string) {
  const cfg = getSyncConfig();
  if (!cfg) return;
  writeLocal<SyncConfig | null>(CONFIG_KEY, null, { ...cfg, name });
  setEntryAuthor(name);
}

/** Kikapcsolás ezen az eszközön: az adatok helyben maradnak, a token és az összefésülés alapja törlődik. */
export async function disconnect() {
  writeLocal<SyncConfig | null>(CONFIG_KEY, null, null);
  setEntryAuthor(undefined);
  await db.syncMeta.clear();
  setState({ status: 'off', lastSyncAt: null, error: null, pending: false });
}
