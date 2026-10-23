import { differenceInCalendarDays } from 'date-fns';
import { useMemo, useState } from 'react';
import { openingFromNow } from '../../domain/balance';
import { defaultCategories, newId, TYPE_LABEL } from '../../domain/defaults';
import { formatFt, formatSigned, parseAmount, parseSignedAmount } from '../../domain/money';
import { formatRange, fromISO, makeConfig, periodEnd, periodName, periodStart, shortDate, startChoice, todayISO } from '../../domain/periods';
import { recordStyle, type Category, type CategoryType, type Entry } from '../../domain/types';
import { initialize, requestPersistence } from '../../db/repo';
import { useSafe } from '../context';
import { CatIcon, Icon } from '../components/common';
import { ImportPanel } from './Settings';
import { SyncPanel } from '../components/SyncPanel';

interface Row {
  cat: Category;
  include: boolean;
  amountText: string;
}

const TYPE_ORDER: CategoryType[] = ['bevetel', 'fix', 'keret', 'megtakaritas'];

const amountOf = (t: string) => (t.trim() === '' || t.trim() === '0' ? 0 : parseAmount(t));
const signedOf = (t: string) => (t.trim() === '' ? 0 : parseSignedAmount(t));

type Step = 'period' | 'cats' | 'past' | 'finish';

const PAID_LABEL: Record<CategoryType, string> = {
  bevetel: 'megérkezett',
  megtakaritas: 'félretéve',
  fix: 'kifizetve',
  keret: 'kifizetve',
};

export function Onboarding() {
  const safe = useSafe();
  const [step, setStep] = useState<Step>('period');
  const [payday, setPayday] = useState('10');
  const [opening, setOpening] = useState('');
  const [startNext, setStartNext] = useState<boolean | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [rows, setRows] = useState<Row[]>(() => defaultCategories().map((cat) => ({ cat, include: true, amountText: '' })));
  const [paid, setPaid] = useState<Record<string, boolean>>({});
  const [spentText, setSpentText] = useState<Record<string, string>>({});
  const [showImport, setShowImport] = useState(false);
  const [showJoin, setShowJoin] = useState(false);

  const today = todayISO();
  const pd = Number(payday);
  const validPayday = Number.isInteger(pd) && pd >= 1 && pd <= 31;
  const cfg = makeConfig(validPayday ? pd : 1, []);
  const choice = startChoice(today, cfg);
  // Ha a mostani időszak nagyobb része eltelt, alapból a következő fizetéssel indul (szinte minden számla lejárt volna).
  const next = choice.suggestNext && (startNext ?? true);
  const firstId = next ? choice.nextId : choice.currentId;
  const daysLeft = differenceInCalendarDays(fromISO(periodEnd(choice.currentId, cfg)), fromISO(today)) + 1;
  const steps: Step[] = next ? ['period', 'cats', 'finish'] : ['period', 'cats', 'past', 'finish'];
  const STEP_LABEL: Record<Step, string> = { period: 'Fizetésnap', cats: 'Kategóriák', past: 'Már megtörtént', finish: 'Kész' };
  const stepIndex = steps.indexOf(step);
  const goNext = () => setStep(steps[stepIndex + 1]);
  const goBack = () => setStep(steps[stepIndex - 1]);

  const included = rows.filter((r) => r.include);
  // „Már megtörtént”: a fix tételek egy jelölővel, a keretek eddigi költése és a részletekben érkező bevétel
  // eddig megérkezett része összegként (az utóbbi is benne van a mostani számlaegyenlegben).
  const fixRows = included.filter((r) => recordStyle(r.cat) === 'fix' && (amountOf(r.amountText) ?? 0) > 0);
  const envRows = included.filter((r) => recordStyle(r.cat) === 'keret' && r.cat.type !== 'bevetel');
  const incRows = included.filter((r) => recordStyle(r.cat) === 'keret' && r.cat.type === 'bevetel');

  const totals = useMemo(() => {
    let inc = 0, exp = 0, sav = 0;
    for (const r of rows) {
      if (!r.include) continue;
      const v = amountOf(r.amountText) ?? 0;
      if (r.cat.type === 'bevetel') inc += v;
      else if (r.cat.type === 'megtakaritas') sav += v;
      else exp += v;
    }
    return { inc, exp, sav, net: inc - exp - sav };
  }, [rows]);

  const next1 = () => {
    const e: Record<string, string> = {};
    if (!validPayday) e.payday = '1 és 31 közötti nap';
    if (signedOf(opening) === null) e.opening = 'Ez nem érvényes összeg';
    setErrors(e);
    if (!Object.keys(e).length) goNext();
  };

  const next2 = () => {
    const e: Record<string, string> = {};
    rows.forEach((r) => {
      if (r.include && amountOf(r.amountText) === null) e[r.cat.id] = 'Érvénytelen';
      if (r.include && !r.cat.name.trim()) e[r.cat.id] = 'Adj nevet';
    });
    if (!rows.some((r) => r.include)) e.none = 'Legalább egy kategória kell';
    setErrors(e);
    if (!Object.keys(e).length) goNext();
  };

  const next3 = () => {
    const e: Record<string, string> = {};
    for (const r of [...envRows, ...incRows]) if (amountOf(spentText[r.cat.id] ?? '') === null) e[`spent-${r.cat.id}`] = 'Érvénytelen';
    setErrors(e);
    if (!Object.keys(e).length) goNext();
  };

  /** A „Már megtörtént” lépésben jelölt tételek rögzítései (csak ha a mostani időszakkal kezdünk). */
  const pastItems = (): { cat: Category; amount: number; settles: boolean }[] => {
    if (next) return [];
    return [
      ...fixRows.filter((r) => paid[r.cat.id]).map((r) => ({ cat: r.cat, amount: amountOf(r.amountText) ?? 0, settles: true })),
      ...[...envRows, ...incRows]
        .map((r) => ({ cat: r.cat, amount: amountOf(spentText[r.cat.id] ?? '') ?? 0, settles: false }))
        .filter((x) => x.amount > 0),
    ];
  };

  const finish = () =>
    safe(async () => {
      const cats = included.map((r, order) => ({ ...r.cat, name: r.cat.name.trim(), defaultAmount: amountOf(r.amountText) ?? 0, order }));
      const items = pastItems();
      const now = new Date().toISOString();
      const entries: Entry[] = items.map((x) => ({
        id: newId(), periodId: firstId, categoryId: x.cat.id, amount: x.amount, date: today, settles: x.settles ? true : undefined, createdAt: now,
      }));
      await initialize(
        {
          id: 'settings',
          payday: pd,
          // A kérdés a mai számlaegyenleg; a nyitó egyenleg az időszak elejére vonatkozik.
          openingBalance: openingFromNow(signedOf(opening) ?? 0, items),
          firstPeriodId: firstId,
          forecastPeriods: 6,
          lastSeenPeriodId: firstId,
          createdAt: now,
        },
        cats,
        { currentId: choice.currentId, entries },
      );
      requestPersistence().catch(() => {});
    });

  const update = (id: string, patch: Partial<Row> & { name?: string }) =>
    setRows(rows.map((r) => (r.cat.id === id ? { ...r, ...patch, cat: patch.name !== undefined ? { ...r.cat, name: patch.name } : r.cat } : r)));

  return (
    <div className="onboarding">
      <div className="brand" style={{ marginBottom: 20 }}>
        <Icon name="wallet" /> Családi költségvetés
      </div>
      <div className="steps" aria-label="Lépések">
        {steps.map((s, i) => (
          <span key={s} className={`step ${i === stepIndex ? 'on' : i < stepIndex ? 'done' : ''}`}>
            <span className="dot">{i < stepIndex ? <Icon name="check" /> : i + 1}</span> {STEP_LABEL[s]}
          </span>
        ))}
      </div>

      {step === 'period' && (
        <div className="card">
          <h1 style={{ marginBottom: 6 }}>Állítsuk be a költségvetést</h1>
          <p className="muted" style={{ marginTop: 0 }}>
            A hónap fizetéstől fizetésig tart. Add meg, hányadikán érkezik a fizetés.
          </p>
          <div className="form-grid">
            <label className="field">
              Fizetésnap
              <input type="number" min={1} max={31} value={payday} autoFocus onChange={(e) => setPayday(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && next1()} />
              {errors.payday && <span className="error">{errors.payday}</span>}
            </label>
            <label className="field">
              Mennyi pénz van most a számlán?
              {/* Szöveges billentyűzet, hogy a mínuszjel is beírható legyen. */}
              <input type="text" className="num" placeholder="0" value={opening} aria-describedby="opening-hint" onChange={(e) => setOpening(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && next1()} />
              <span id="opening-hint" className="tiny faint">Ha a számla mínuszban van, negatív is lehet (pl. -20 000).</span>
              {errors.opening && <span className="error">{errors.opening}</span>}
            </label>
          </div>
          {validPayday && choice.suggestNext && (
            <div className="start-choice" role="radiogroup" aria-label="Mikor induljon a költségvetés?">
              <button role="radio" aria-checked={next} className={`choice ${next ? 'on' : ''}`} onClick={() => setStartNext(true)}>
                <Icon name={next ? 'circle-check' : 'circle'} />
                <span>
                  <strong>Kezdjük a következő fizetéssel ({shortDate(choice.nextStart)})</strong>
                  <span className="tiny muted">
                    A mostani hónapból már csak {daysLeft} nap van hátra. Addig a rögzített kiadások a mostani egyenlegből fogynak.
                  </span>
                </span>
              </button>
              <button role="radio" aria-checked={!next} className={`choice ${!next ? 'on' : ''}`} onClick={() => setStartNext(false)}>
                <Icon name={!next ? 'circle-check' : 'circle'} />
                <span>
                  <strong>A mostani hónappal ({formatRange(periodStart(choice.currentId, cfg), periodEnd(choice.currentId, cfg))})</strong>
                  <span className="tiny muted">Az ebben a hónapban már kifizetett tételeket egy későbbi lépésben jelölheted.</span>
                </span>
              </button>
            </div>
          )}
          {validPayday && (
            <div className="banner info" style={{ marginTop: 16, marginBottom: 0 }}>
              <Icon name="calendar" />
              <span className="grow">
                Az első hónap: <strong>{periodName(firstId)}</strong> ({formatRange(periodStart(firstId, cfg), periodEnd(firstId, cfg))})
              </span>
            </div>
          )}
          <div className="wizard-nav">
            <button className="ghost" onClick={() => { setShowImport(!showImport); setShowJoin(false); }}>
              <Icon name="upload" /> Van már mentésem
            </button>
            <button className="ghost" onClick={() => { setShowJoin(!showJoin); setShowImport(false); }}>
              <Icon name="users" /> Csatlakozom egy közöshöz
            </button>
            <button className="primary" onClick={next1}>Tovább <Icon name="arrow-right" /></button>
          </div>
          {showImport && (
            <div className="import-preview">
              <ImportPanel />
            </div>
          )}
          {showJoin && (
            <div className="import-preview">
              <p className="small muted" style={{ marginTop: 0 }}>
                Ha a párod már használja az appot közösen (GitHubon), add meg ugyanazt a tárolót és tokent, és a saját neved.
              </p>
              <SyncPanel join />
            </div>
          )}
        </div>
      )}

      {step === 'cats' && (
        <div className="card">
          <h1 style={{ marginBottom: 6 }}>Kategóriák és havi összegek</h1>
          <p className="muted" style={{ marginTop: 0 }}>
            Ez a kiinduló terv. Kapcsold ki, amire nincs szükséged, és írd be a szokásos havi összeget. Később bármikor módosíthatod.
          </p>
          {TYPE_ORDER.map((t) => (
            <div key={t}>
              <div className="section-title">{TYPE_LABEL[t]}</div>
              {rows.filter((r) => r.cat.type === t).map((r) => (
                <div key={r.cat.id} className={`ob-row ${r.include ? '' : 'off'}`}>
                  <input type="checkbox" checked={r.include} aria-label={`${r.cat.name} használata`} onChange={(e) => update(r.cat.id, { include: e.target.checked })} />
                  <CatIcon cat={r.cat} />
                  <input type="text" className="sm" value={r.cat.name} disabled={!r.include} aria-label="Név" onChange={(e) => update(r.cat.id, { name: e.target.value })} />
                  <span className="tiny faint ob-group">{r.cat.group ?? ''}</span>
                  <div>
                    <input type="text" inputMode="numeric" className="sm num" style={{ width: 120, textAlign: 'right' }} placeholder="0 Ft" disabled={!r.include} value={r.amountText} aria-label={`${r.cat.name} havi összege`} onChange={(e) => update(r.cat.id, { amountText: e.target.value })} />
                    {errors[r.cat.id] && <div className="error">{errors[r.cat.id]}</div>}
                  </div>
                </div>
              ))}
            </div>
          ))}
          {errors.none && <div className="error">{errors.none}</div>}
          <div className="wizard-nav sticky-nav">
            <span className="small num muted" style={{ marginRight: 'auto' }}>
              Tervezett havi egyenleg: <span className={totals.net < 0 ? 'neg' : 'pos'}>{formatSigned(totals.net)}</span>
            </span>
            <button onClick={goBack}><Icon name="arrow-left" /> Vissza</button>
            <button className="primary" onClick={next2}>Tovább <Icon name="arrow-right" /></button>
          </div>
        </div>
      )}

      {step === 'past' && (
        <div className="card">
          <h1 style={{ marginBottom: 6 }}>Ebben a hónapban már megtörtént</h1>
          <p className="muted" style={{ marginTop: 0 }}>
            Jelöld, ami a mostani hónapban már ki van fizetve vagy megérkezett. A terv összegével rögzül, később módosítható.
            Ezekből és a mostani egyenlegből számolja ki az app, mennyi pénz volt a hónap elején.
          </p>
          {fixRows.length === 0 && envRows.length === 0 && incRows.length === 0 && (
            <p className="small faint">Nincs olyan tétel, amit itt jelölni lehetne.</p>
          )}
          {fixRows.map((r) => (
            <label key={r.cat.id} className="ob-row ob-past">
              <input type="checkbox" checked={!!paid[r.cat.id]} onChange={(e) => setPaid({ ...paid, [r.cat.id]: e.target.checked })} />
              <CatIcon cat={r.cat} />
              <span>{r.cat.name} <span className="tiny faint">· {PAID_LABEL[r.cat.type]}</span></span>
              <span className="num small muted" style={{ textAlign: 'right' }}>{formatFt(amountOf(r.amountText) ?? 0)}</span>
            </label>
          ))}
          {[
            { rows: envRows, title: 'Keretekből eddig elköltve (nem kötelező)', label: 'eddig elköltve' },
            { rows: incRows, title: 'Részletekben érkező bevételből eddig megérkezett (nem kötelező)', label: 'eddig megérkezett' },
          ].map(
            (sec) =>
              sec.rows.length > 0 && (
                <div key={sec.label}>
                  <div className="section-title" style={{ marginTop: 16 }}>{sec.title}</div>
                  {sec.rows.map((r) => (
                    <div key={r.cat.id} className="ob-row ob-past">
                      <span />
                      <CatIcon cat={r.cat} />
                      <span>{r.cat.name}</span>
                      <div>
                        <input
                          type="text" inputMode="numeric" className="sm num" style={{ width: 120, textAlign: 'right' }} placeholder="0 Ft"
                          aria-label={`${r.cat.name}: ${sec.label}`} value={spentText[r.cat.id] ?? ''}
                          onChange={(e) => setSpentText({ ...spentText, [r.cat.id]: e.target.value })}
                        />
                        {errors[`spent-${r.cat.id}`] && <div className="error">{errors[`spent-${r.cat.id}`]}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              ),
          )}
          <div className="wizard-nav">
            <button onClick={goBack}><Icon name="arrow-left" /> Vissza</button>
            <button className="primary" onClick={next3}>Tovább <Icon name="arrow-right" /></button>
          </div>
        </div>
      )}

      {step === 'finish' && (
        <div className="card">
          <h1 style={{ marginBottom: 6 }}>Minden kész</h1>
          <p className="muted" style={{ marginTop: 0 }}>Így néz ki a kiinduló havi terv:</p>
          <dl className="sumlist num" style={{ maxWidth: 380 }}>
            <dt>Bevétel</dt><dd>{formatFt(totals.inc)}</dd>
            <dt>Kiadás</dt><dd>−{formatFt(totals.exp)}</dd>
            <dt>Megtakarítás</dt><dd>−{formatFt(totals.sav)}</dd>
            <dt className="total">Havi egyenleg</dt>
            <dd className={`total ${totals.net < 0 ? 'neg' : 'pos'}`}>{formatSigned(totals.net)}</dd>
          </dl>
          <p className="small muted num" style={{ marginBottom: 0 }}>
            {next
              ? `A költségvetés a következő fizetéssel indul (${shortDate(choice.nextStart)}), ${formatFt(signedOf(opening) ?? 0)} kezdő egyenleggel.`
              : `Nyitó egyenleg a hónap elején (${shortDate(periodStart(firstId, cfg))}): ${formatFt(openingFromNow(signedOf(opening) ?? 0, pastItems()))}.`}
          </p>
          <ul className="small muted" style={{ paddingLeft: 18, marginTop: 16 }}>
            <li>Az adatok ebben a böngészőben tárolódnak. Havonta érdemes menteni, és az app emlékeztetni is fog rá.</li>
            <li>Safariban használd az appot a Dockhoz hozzáadva (Fájl → Hozzáadás a Dockhoz).</li>
          </ul>
          <div className="wizard-nav">
            <button onClick={goBack}><Icon name="arrow-left" /> Vissza</button>
            <button className="primary" onClick={finish}>Kezdés <Icon name="arrow-right" /></button>
          </div>
        </div>
      )}
    </div>
  );
}
