import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { computeSummaries } from '../domain/balance';
import { formatRange, makeConfig, msUntilNextDay, periodName, periodStart, shortDate, todayISO } from '../domain/periods';
import type { BudgetData, PeriodId } from '../domain/types';
import { SAMPLE } from '../db/sampleMode';
import { loadAll, migrateBasePlans, requestPersistence, updateSettings } from '../db/repo';
import { backupIsStale, backupLabel, daysSince, exportBackup } from './backup';
import { BudgetProvider, ToastProvider, useSafe, type Screen } from './context';
import { useRouter } from './router';
import { isQuickEntryKey } from './shortcuts';
import { Icon, NOTE_TAGS_LIST } from './components/common';
import { CoverSheet, coverSheetName, parseCoverSheet } from './components/Cover';
import { ErrorBoundary } from './components/ErrorBoundary';
import { QuickEntry } from './components/QuickEntry';
import { Sheet } from './components/Sheet';
import { parseTrendSheet, TrendSheet, trendSheetName } from './components/Trend';
import { tagSummary } from '../domain/analysis';
import { dueBills } from '../domain/todos';

import { SyncButton, useAutoSync } from './components/SyncButton';
import { useSyncConfig } from '../sync/engine';
import { Analysis } from './screens/Analysis';
import { BillCalendar } from './screens/BillCalendar';
import { Categories } from './screens/Categories';
import { Dashboard } from './screens/Dashboard';
import { Onboarding } from './screens/Onboarding';
import { Planner } from './screens/Planner';
import { Record } from './screens/Record';
import { Settings } from './screens/Settings';

/** A képernyők neve (oldalsáv, fejléc, oldalcím) és rövid neve (navigációs sín, alsó fülek). */
const NAV: { id: Screen; label: string; short: string; icon: string }[] = [
  { id: 'dashboard', label: 'Áttekintés', short: 'Áttekintés', icon: 'layout-dashboard' },
  { id: 'record', label: 'Keretek és számlák', short: 'Keretek', icon: 'wallet' },
  { id: 'planner', label: 'Tervező', short: 'Tervező', icon: 'adjustments-horizontal' },
  { id: 'analysis', label: 'Elemzés', short: 'Elemzés', icon: 'chart-histogram' },
  { id: 'calendar', label: 'Számlanaptár', short: 'Naptár', icon: 'calendar-due' },
  { id: 'categories', label: 'Kategóriák', short: 'Kategóriák', icon: 'tags' },
  { id: 'settings', label: 'Beállítások', short: 'Beállítások', icon: 'settings' },
];
const nav = (id: Screen) => NAV.find((n) => n.id === id)!;

/** Kompakt elrendezésben a ritkábban használt képernyők a Több lapra kerülnek, hogy négy fül maradjon. */
const MORE: Screen[] = ['analysis', 'calendar', 'categories', 'settings'];

/** Indításkori adatmigráció; a felület csak utána jelenik meg, hogy ne számoljon a régi adatokkal. */
function useStartupMigration() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    migrateBasePlans()
      .catch((e) => console.error('Az indításkori migráció nem sikerült', e))
      .finally(() => setReady(true));
  }, []);
  return ready;
}

export function App() {
  const ready = useStartupMigration();
  const raw = useLiveQuery(loadAll, []);
  const onboarding = !!raw && ready && !raw.settings;
  // A varázsló (pl. a Beállításokban kért teljes törlés után) az Áttekintésre vezessen, ne a korábbi képernyőre.
  // Közben a képernyők nem figyelik az előzményeket: egy vissza lépés csendben visszahozna egy régi útvonalat
  // (vagy réteg-bejegyzést), és a varázsló után az nyílna meg, ezért az is azonnal kikerül.
  useEffect(() => {
    if (!onboarding) return;
    const clear = () => {
      if (!window.location.hash && window.history.state === null) return;
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    };
    clear();
    window.addEventListener('popstate', clear);
    window.addEventListener('hashchange', clear);
    return () => {
      window.removeEventListener('popstate', clear);
      window.removeEventListener('hashchange', clear);
    };
  }, [onboarding]);
  return (
    <ToastProvider>
      {!raw || !ready ? null : onboarding ? (
        <Onboarding />
      ) : (
        <Main data={raw as BudgetData} />
      )}
    </ToastProvider>
  );
}

/**
 * A mai dátum. Éjfélkor egy időzítő frissíti (nyitva hagyott appnál a fizetésnapon új időszak kezdődik),
 * és akkor is, amikor az ablak újra előtérbe kerül, mert alvó gépen az időzítő késhet.
 */
function useToday() {
  const [today, setToday] = useState(todayISO);
  useEffect(() => {
    const h = () => setToday(todayISO());
    window.addEventListener('focus', h);
    document.addEventListener('visibilitychange', h);
    return () => {
      window.removeEventListener('focus', h);
      document.removeEventListener('visibilitychange', h);
    };
  }, []);
  useEffect(() => {
    const t = window.setTimeout(() => setToday(todayISO()), msUntilNextDay(new Date()) + 1000);
    return () => window.clearTimeout(t);
  }, [today]);
  return today;
}

function Main({ data }: { data: BudgetData }) {
  const today = useToday();
  const summaries = useMemo(() => computeSummaries(data, today), [data, today]);
  const cfg = useMemo(() => makeConfig(data.settings.payday, data.overrides), [data.settings.payday, data.overrides]);
  const safe = useSafe();
  const router = useRouter();
  const { route, navigate, openQuick, openSheet, closeLayer, clearFocus } = router;
  const screen = route.screen;
  // null: a folyamatban lévő időszakot követi, így fizetésnapkor (nyitva hagyott appnál is) átlép az újra.
  const [selected, setSelected] = useState<PeriodId | null>(null);
  const periodId = selected !== null && summaries.byId.has(selected) ? selected : summaries.currentId;

  useEffect(() => {
    requestPersistence().catch(() => {});
  }, []);

  useEffect(() => {
    // A mintaadatos fül a címéről is felismerhető (a képernyőn nem jelenik meg, hogy a felmérést ne zavarja).
    const prefix = SAMPLE.active ? '[Minta] ' : '';
    document.title = prefix + (screen === 'dashboard' ? 'Családi költségvetés' : `${nav(screen).label} · Családi költségvetés`);
  }, [screen]);

  const go = useCallback(
    (s: Screen, cat?: string) => {
      // Ugyanazon a képernyőn (pl. csak a fókusz változik) nem keletkezik új előzménybejegyzés.
      navigate({ screen: s, focus: cat ?? null, quick: false }, s === screen);
      if (!cat && s !== screen) window.scrollTo({ top: 0 });
    },
    [navigate, screen],
  );

  // A menüpontra kattintás a már látott képernyőn is a lap tetejére visz.
  const tab = (s: Screen) => {
    go(s);
    window.scrollTo({ top: 0 });
  };

  // A lap a megnyitáskori időszakhoz tartozik: egy közben bekövetkező időszakváltás ne vigye át máshová.
  const openCover = useCallback((categoryId: string) => openSheet(coverSheetName(periodId, categoryId)), [openSheet, periodId]);
  const cover = parseCoverSheet(router.sheet);
  const openTrend = useCallback((key: string) => openSheet(trendSheetName(key)), [openSheet]);
  const trend = parseTrendSheet(router.sheet);
  // A megjegyzésmezők javaslatai a korábbi #címkékből.
  const tags = useMemo(() => tagSummary(data.entries).map((t) => t.tag), [data.entries]);

  const setPeriodId = useCallback(
    (id: PeriodId) => setSelected(id === summaries.currentId ? null : id),
    [summaries.currentId],
  );

  // N: gyors rögzítés bárhonnan, ha épp nem gépelünk és nincs nyitva másik réteg.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (route.quick || router.sheet) return;
      if (!isQuickEntryKey(e, e.target instanceof HTMLElement ? e.target : null)) return;
      e.preventDefault();
      openQuick();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [route.quick, router.sheet, openQuick]);

  const s = data.settings;
  const newPeriod = s.lastSeenPeriodId !== undefined && s.lastSeenPeriodId < summaries.currentId;
  useEffect(() => {
    if (s.lastSeenPeriodId === undefined) updateSettings({ lastSeenPeriodId: summaries.currentId }).catch(console.error);
  }, [s.lastSeenPeriodId, summaries.currentId]);
  const beforeFirst = summaries.currentId < s.firstPeriodId;

  const cur = summaries.byId.get(summaries.currentId)!;
  // Közös használatnál a GitHub tárolja az előzményeket is, a fájlba mentés nem kell külön figyelmeztetés.
  const syncCfg = useSyncConfig();
  useAutoSync(data);
  const stale = !syncCfg && backupIsStale(data);
  const days = daysSince(s.lastExportAt);
  // Az oldalsáv Rögzítés menüpontja a folyamatban lévő időszak lejárt számláit számolja.
  const overdue = useMemo(() => dueBills(data.categories, cur, today).filter((b) => b.overdue).length, [data.categories, cur, today]);
  // A mentés vagy a szinkron állapota: telefonon a fejlécben ikonként, asztalon az oldalsáv alján.
  const saveStatus = syncCfg ? (
    <SyncButton onOpenSettings={() => tab('settings')} />
  ) : (
    <button
      className={`btn sm backup ${stale ? 'stale' : ''}`}
      title={`Mentés letöltése fájlba · ${backupLabel(days)}`}
      aria-label={`Mentés letöltése fájlba · ${backupLabel(days)}`}
      onClick={() => safe(() => exportBackup(data))}
    >
      <Icon name={stale ? 'alert-triangle' : 'cloud-download'} /> <span className="backup-label">{stale ? 'Mentés letöltése' : backupLabel(days)}</span>
    </button>
  );

  return (
    <BudgetProvider value={{ data, summaries, cfg, today, periodId, setPeriodId, go, openQuick, openCover, openTrend, focusCategoryId: route.focus, clearFocus }}>
      <div className="app">
        {/* Asztalon oldalsáv: logó, kiemelt rögzítés, a menü ikonokkal, alul a mentés állapota. */}
        <aside className="sidebar">
          <div className="side-brand">
            <span className="side-logo"><Icon name="wallet" /></span>
            <span>Családi<br />költségvetés</span>
          </div>
          <button className="btn primary side-add" title="Kiadás rögzítése (N)" aria-label="Kiadás rögzítése" aria-keyshortcuts="N" onClick={openQuick}>
            <Icon name="plus" /> <span className="side-add-label">Kiadás rögzítése</span> <kbd aria-hidden="true">N</kbd>
          </button>
          <nav className="side-nav" aria-label="Fő navigáció">
            {NAV.map((n) => (
              <button key={n.id} className={screen === n.id ? 'on' : ''} aria-current={screen === n.id ? 'page' : undefined} onClick={() => tab(n.id)}>
                <Icon name={n.icon} /> <span className="nav-full">{n.label}</span>
                <span className="nav-short">{n.short}</span>
                {n.id === 'record' && <OverdueBadge count={overdue} />}
              </button>
            ))}
          </nav>
          <div className="side-foot">
            {!syncCfg && stale && (
              <div className="side-alert">
                <strong>{backupLabel(days)}</strong>
                <span>Az adatok csak ebben a böngészőben vannak.</span>
              </div>
            )}
            {saveStatus}
          </div>
        </aside>

        <div className="app-main">
        {/* Kompakt elrendezésben a képernyő címe. A képernyő saját h1-e a felolvasóé, így ez nem ismétli meg. */}
        <header className="topbar">
          <p className="topbar-title" aria-hidden="true">{nav(screen).label}</p>
          {saveStatus}
        </header>

        {newPeriod && (
          <div className="banner info">
            <Icon name="sparkles" />
            <span className="grow">
              Új hónap kezdődött: <strong>{periodName(cur.id)}</strong> ({formatRange(cur.start, cur.end)}). Jó alkalom egy mentés letöltésére.
            </span>
            <button
              className="btn sm primary"
              onClick={() =>
                safe(async () => {
                  await exportBackup(data);
                  await updateSettings({ lastSeenPeriodId: summaries.currentId });
                  setSelected(null);
                })
              }
            >
              <Icon name="download" /> Mentés letöltése
            </button>
            <button
              className="btn sm ghost"
              onClick={() =>
                safe(async () => {
                  await updateSettings({ lastSeenPeriodId: summaries.currentId });
                  setSelected(null);
                })
              }
            >
              Később
            </button>
          </div>
        )}

        {beforeFirst && (
          <div className="banner info">
            <Icon name="calendar-time" />
            {/* A „következő fizetéssel” indulásnál és egy későbbre tett fizetésnap után is igaz. */}
            <span className="grow">
              Az első költségvetési hónap ({periodName(s.firstPeriodId)}, {shortDate(periodStart(s.firstPeriodId, cfg))}) még nem
              kezdődött el. Addig a havi terv nem számít, a futó egyenleget csak a rögzített tételek változtatják.
            </span>
          </div>
        )}

        <main>
          <ErrorBoundary resetKey={`${screen}|${periodId}`}>
            {screen === 'dashboard' && <Dashboard />}
            {screen === 'record' && <Record />}
            {screen === 'planner' && <Planner />}
            {screen === 'analysis' && <Analysis />}
            {screen === 'calendar' && <BillCalendar />}
            {screen === 'categories' && <Categories />}
            {screen === 'settings' && <Settings />}
          </ErrorBoundary>
        </main>

        {/* Kompakt elrendezésben alul, a hüvelykujj közelében: a fő művelet és a négy fül. A fejlécen kívül van, hogy
            a fix pozíció ne a fejléchez igazodjon. */}
        <div className="dock">
          <button className="dock-add" aria-keyshortcuts="N" onClick={openQuick}>
            <Icon name="plus" /> Kiadás rögzítése
          </button>
          <nav className="tabbar" aria-label="Fő navigáció">
            {(['dashboard', 'record', 'planner'] as const).map((id) => (
              <TabButton key={id} id={id} on={screen === id} onClick={() => tab(id)} badge={id === 'record' ? overdue : 0} />
            ))}
            <button
              className={MORE.includes(screen) ? 'on' : ''}
              aria-haspopup="dialog"
              aria-expanded={router.sheet === 'more'}
              onClick={() => openSheet('more')}
            >
              <Icon name="dots" />
              <span>Több</span>
            </button>
          </nav>
        </div>

        {router.sheet === 'more' && (
          <Sheet title="Több" onClose={closeLayer}>
            <div className="sheet-menu">
              {MORE.map((id) => (
                <button
                  key={id}
                  className={screen === id ? 'on' : ''}
                  aria-current={screen === id ? 'page' : undefined}
                  // A már látott képernyőnél csak bezárul, hogy ne maradjon üres vissza lépés az előzményekben.
                  onClick={() => (id === screen ? closeLayer() : tab(id))}
                >
                  <Icon name={nav(id).icon} /> {nav(id).label}
                </button>
              ))}
            </div>
          </Sheet>
        )}
        {trend && <TrendSheet unitKey={trend} onClose={closeLayer} />}
        <datalist id={NOTE_TAGS_LIST}>
          {tags.map((t) => <option key={t} value={`#${t}`} />)}
        </datalist>
        {cover && <CoverSheet periodId={cover.periodId} categoryId={cover.categoryId} onClose={closeLayer} />}
        {route.quick && <QuickEntry onClose={closeLayer} />}
        </div>
      </div>
    </BudgetProvider>
  );
}

function TabButton({ id, on, onClick, badge }: { id: Screen; on: boolean; onClick: () => void; badge: number }) {
  const n = nav(id);
  return (
    <button className={on ? 'on' : ''} aria-current={on ? 'page' : undefined} onClick={onClick}>
      <Icon name={n.icon} />
      <span>{n.short}</span>
      <OverdueBadge count={badge} />
    </button>
  );
}

/** A lejárt számlák száma a „Keretek és számlák” menüpontján, a felolvasónak kiírva. */
function OverdueBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="side-badge" title={`${count} lejárt számla`}>
      {count}
      <span className="sr-only"> lejárt számla</span>
    </span>
  );
}
