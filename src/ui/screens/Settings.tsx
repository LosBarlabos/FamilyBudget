import { useEffect, useId, useRef, useState } from 'react';
import { buildCsv, parseImport, previewImport, type ExportFile, type ImportPreview } from '../../domain/exportFormat';
import { parseSignedAmount } from '../../domain/money';
import { formatRange, periodName, periodStart, validateOverride } from '../../domain/periods';
import { clearOverride, importAll, requestPersistence, restoreSettings, saveBasicSettings, setOverride, wipeAll } from '../../db/repo';
import { backupLabel, daysSince, exportBackup } from '../backup';
import { useBudget, useSafe, useToast } from '../context';
import { downloadFile, Icon, Segmented, useFieldErrors, useThemePref, type ThemePref } from '../components/common';
import { SyncPanel } from '../components/SyncPanel';
import { disconnect } from '../../sync/engine';

export function Settings() {
  const s = useBudget().data.settings;
  return (
    <>
      <div className="page-head">
        <h1 className="page-title">Beállítások</h1>
      </div>
      {/* A kulcs miatt az űrlap újraindul, ha a beállítások máshonnan (pl. visszatöltésből) változnak. */}
      <BasicSettings key={`${s.payday}|${s.openingBalance}|${s.forecastPeriods}`} />
      <Appearance />
      <PeriodOverrides />
      <div className="card">
        <div className="card-head"><h2>Közös használat (GitHub)</h2></div>
        <SyncPanel />
      </div>
      <Backup />
      <Storage />
      <DangerZone />
    </>
  );
}

function BasicSettings() {
  const { data } = useBudget();
  const toast = useToast();
  const safe = useSafe();
  const s = data.settings;
  const [payday, setPayday] = useState(String(s.payday));
  const [opening, setOpening] = useState(String(s.openingBalance));
  const [forecast, setForecast] = useState(String(s.forecastPeriods));
  const { field, message, check } = useFieldErrors<'payday' | 'opening' | 'forecast'>();

  const save = async () => {
    const e: Partial<Record<'payday' | 'opening' | 'forecast', string>> = {};
    const pd = Number(payday);
    if (!Number.isInteger(pd) || pd < 1 || pd > 31) e.payday = '1 és 31 közötti nap';
    const ob = parseSignedAmount(opening);
    if (ob === null) e.opening = 'Ez nem érvényes összeg';
    const fc = Number(forecast);
    if (!Number.isInteger(fc) || fc < 1 || fc > 24) e.forecast = '1 és 24 között';
    if (!check(e)) return;
    await safe(async () => {
      const { before, removed } = await saveBasicSettings({ payday: pd, openingBalance: ob!, forecastPeriods: fc });
      const undo = () => restoreSettings(before, removed);
      if (removed.length === 0) return toast('Beállítások mentve', undo);
      const names = removed.map((o) => periodName(o.periodId, true)).join(', ');
      toast(`Beállítások mentve. Az új fizetésnappal érvénytelenné vált kezdőnap-felülírás törölve: ${names}.`, undo);
    });
  };

  return (
    <div className="card">
      <div className="card-head"><h2>Alapbeállítások</h2></div>
      <div className="form-grid">
        <label className="field">
          Fizetésnap (a hónap napja)
          <input type="number" min={1} max={31} value={payday} onChange={(e) => setPayday(e.target.value)} {...field('payday')} />
          {message('payday')}
        </label>
        <label className="field">
          Nyitó egyenleg (az első hónap elején)
          <input type="text" inputMode="numeric" className="num" value={opening} onChange={(e) => setOpening(e.target.value)} {...field('opening')} />
          {message('opening')}
        </label>
        <label className="field">
          Előrejelzés (hónap előre)
          <input type="number" min={1} max={24} value={forecast} onChange={(e) => setForecast(e.target.value)} {...field('forecast')} />
          {message('forecast')}
        </label>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
        <span className="tiny faint" style={{ flex: 1, minWidth: 220 }}>
          A fizetésnap módosításakor a meglévő rögzítések abban a hónapban maradnak, ahová korábban kerültek.
        </span>
        <button className="btn primary" onClick={save}>Mentés</button>
      </div>
    </div>
  );
}

function PeriodOverrides() {
  const { data, summaries, cfg } = useBudget();
  const toast = useToast();
  const safe = useSafe();
  const [pid, setPid] = useState(summaries.currentId);
  const [date, setDate] = useState(periodStart(summaries.currentId, cfg));
  const [error, setError] = useState('');
  const overrideErrorId = useId();

  useEffect(() => setDate(periodStart(pid, cfg)), [pid, cfg]);

  const save = async () => {
    const err = validateOverride(pid, date, cfg);
    if (err) return setError(err);
    const prev = data.overrides.find((o) => o.periodId === pid);
    await safe(async () => {
      await setOverride({ periodId: pid, startDate: date });
      toast(`${periodName(pid)} kezdete: ${date.replaceAll('-', '.')}.`, () => (prev ? setOverride(prev) : clearOverride(pid)));
    });
  };

  return (
    <div className="card">
      <div className="card-head">
        <h2>Időszak kezdőnapja</h2>
        <span className="small faint">pl. ha a fizetés hétvége miatt korábban érkezik</span>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label className="field">
          Időszak
          {/* A címke körbeöleli a mezőt: külön név nélkül a felolvasott név az összes lehetőséget tartalmazná. */}
          <select aria-label="Időszak" value={pid} onChange={(e) => { setPid(e.target.value); setError(''); }}>
            {summaries.periods.map((p) => (
              <option key={p.id} value={p.id}>{periodName(p.id, true)} ({formatRange(p.start, p.end)})</option>
            ))}
          </select>
        </label>
        <label className="field">
          Kezdőnap
          <input type="date" value={date} aria-invalid={error ? true : undefined} aria-describedby={error ? overrideErrorId : undefined} onChange={(e) => { setDate(e.target.value); setError(''); }} />
        </label>
        <button className="btn" onClick={save}>Beállítás</button>
      </div>
      {error && <div className="error mt-1-5" id={overrideErrorId} role="alert">{error}</div>}
      {data.overrides.length > 0 && (
        <div className="mt-3">
          {data.overrides.map((o) => (
            <div key={o.periodId} className="small" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
              <Icon name="calendar-event" style={{ color: 'var(--color-text-subtle)' }} />
              <span style={{ flex: 1 }}>{periodName(o.periodId, true)}: kezdés {o.startDate.replaceAll('-', '.')}.</span>
              <button className="btn sm ghost" onClick={() => safe(async () => { await clearOverride(o.periodId); toast('Visszaállítva a fizetésnapra', () => setOverride(o)); })}>
                Visszaállítás
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Backup() {
  const { data, summaries } = useBudget();
  const safe = useSafe();
  const days = daysSince(data.settings.lastExportAt);
  return (
    <div className="card">
      <div className="card-head">
        <h2>Biztonsági mentés</h2>
        <span className={`small ${days === null || days >= 30 ? 'neg' : 'faint'}`}>{backupLabel(days)}</span>
      </div>
      <p className="small muted mt-0">
        Az adatok ebben a böngészőben vannak tárolva. A mentés egy fájl, amit a Letöltések mappában találsz. Érdemes egy
        szinkronizált mappába (OneDrive, iCloud) áttenni, így a gép elvesztését is túléli.
      </p>
      <div className="cluster wrap gap-2">
        <button className="btn primary" onClick={() => safe(() => exportBackup(data))}>
          <Icon name="download" /> Mentés letöltése
        </button>
        <button className="btn" onClick={() => downloadFile(`csaladi-koltsegvetes-${new Date().toISOString().slice(0, 10)}.csv`, buildCsv(data, summaries), 'text/csv;charset=utf-8')}>
          <Icon name="table" /> Táblázat (CSV, Excelhez)
        </button>
      </div>
      <div style={{ borderTop: '1px solid var(--color-border)', marginTop: 16, paddingTop: 16 }}>
        <ImportPanel />
      </div>
    </div>
  );
}

export function ImportPanel({ onDone }: { onDone?: () => void }) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ f: ExportFile; preview: ImportPreview; name: string } | null>(null);
  const [error, setError] = useState('');

  const pick = async (fl: File | undefined) => {
    setError('');
    setFile(null);
    if (!fl) return;
    try {
      const f = parseImport(await fl.text());
      setFile({ f, preview: previewImport(f), name: fl.name });
    } catch (e) {
      setError((e as Error).message);
    }
    if (input.current) input.current.value = '';
  };

  const dt = (iso: string | null) => (iso ? new Date(iso).toLocaleString('hu-HU', { dateStyle: 'medium', timeStyle: 'short' }) : '–');

  return (
    <div>
      <input ref={input} type="file" accept="application/json,.json" hidden onChange={(e) => pick(e.target.files?.[0])} />
      <button className="btn" onClick={() => input.current?.click()}>
        <Icon name="upload" /> Visszatöltés mentésből
      </button>
      {error && <div className="error mt-2" role="alert">{error}</div>}
      {file && (
        <div className="import-preview">
          <div style={{ fontWeight: 500, marginBottom: 6 }}>{file.name}</div>
          <div className="small muted num">
            {file.preview.periods} hónap · {file.preview.categories} kategória · {file.preview.entries} rögzítés
            <br />
            Készült: {dt(file.preview.exportedAt)} · utolsó rögzítés: {dt(file.preview.lastChange)}
          </div>
          <div className="small" style={{ margin: '10px 0', color: 'var(--color-warn)' }}>
            <Icon name="alert-triangle" /> A betöltés felülírja a jelenlegi adatokat.
          </div>
          <div className="cluster gap-2">
            <button
              className="btn danger"
              onClick={async () => {
                try {
                  await importAll(file.f);
                } catch (e) {
                  return setError(`Nem sikerült betölteni: ${(e as Error).message}`);
                }
                setFile(null);
                toast('Mentés betöltve');
                onDone?.();
              }}
            >
              Felülírás és betöltés
            </button>
            <button className="btn ghost" onClick={() => setFile(null)}>Mégse</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Storage() {
  const [persisted, setPersisted] = useState<boolean | null | undefined>(undefined);
  const [usage, setUsage] = useState<number | null>(null);

  useEffect(() => {
    requestPersistence().then(setPersisted).catch(() => setPersisted(null));
    navigator.storage?.estimate?.().then((e) => setUsage(e.usage ?? null)).catch(() => {});
  }, []);

  return (
    <div className="card">
      <div className="card-head"><h2>Tárolás</h2></div>
      <div className="small cluster gap-2">
        <Icon name={persisted ? 'shield-check' : 'shield'} style={{ color: persisted ? 'var(--color-ok)' : 'var(--color-warn)', fontSize: 18 }} />
        {persisted === undefined
          ? 'Ellenőrzés…'
          : persisted
            ? 'Tartós tárolás engedélyezve: a böngésző nem törli magától az adatokat.'
            : 'A böngésző nem adott tartós tárolást. Használd az appot telepítve (lásd lent), és ments rendszeresen.'}
      </div>
      {usage !== null && <div className="tiny faint mt-1-5">Felhasznált hely: {Math.max(1, Math.round(usage / 1024))} kB</div>}
      <ul className="small muted" style={{ margin: '12px 0 0', paddingLeft: 18 }}>
        <li>Safariban: Fájl → Hozzáadás a Dockhoz. A sima weboldal adatait a Safari 7 nap használaton kívül törölheti, a Dockhoz adott appét nem.</li>
        <li>Chrome-ban: a címsor jobb oldalán a „Telepítés” ikon.</li>
        <li>Más böngészőben vagy gépen az app üresen indul. Ott a mentésből tudod visszatölteni az adatokat.</li>
      </ul>
    </div>
  );
}

function DangerZone() {
  const safe = useSafe();
  const [armed, setArmed] = useState(false);
  return (
    <div className="card">
      <div className="card-head"><h2>Minden adat törlése</h2></div>
      {!armed ? (
        <button className="btn danger" onClick={() => setArmed(true)}><Icon name="trash" /> Összes adat törlése…</button>
      ) : (
        <div className="small cluster wrap gap-2">
          <span style={{ color: 'var(--color-danger)', flex: 1, minWidth: 220 }}>
            Minden kategória, terv és rögzítés végleg törlődik ebből a böngészőből. Előtte érdemes menteni.
          </span>
          {/* A közös használat előbb kikapcsol, különben a következő szinkron a közös költségvetést is kiürítené. */}
          <button
            className="btn danger"
            onClick={() =>
              safe(async () => {
                await disconnect();
                await wipeAll();
              })
            }
          >
            Végleges törlés
          </button>
          <button className="btn ghost" onClick={() => setArmed(false)}>Mégse</button>
        </div>
      )}
    </div>
  );
}

const THEMES: { id: ThemePref; label: string }[] = [
  { id: 'system', label: 'Rendszer' },
  { id: 'light', label: 'Világos' },
  { id: 'dark', label: 'Sötét' },
];

/** Téma választása: eszközönként tárolódik, a közös adatba nem kerül. */
function Appearance() {
  const [pref, setPref] = useThemePref();
  return (
    <div className="card">
      <div className="card-head"><h2>Megjelenés</h2></div>
      <div className="cluster wrap gap-3">
        <Segmented label="Téma" options={THEMES} value={pref} onChange={setPref} />
        <span className="small muted">A „Rendszer” a telefon vagy a gép beállítását követi. Csak ezen az eszközön érvényes.</span>
      </div>
    </div>
  );
}
