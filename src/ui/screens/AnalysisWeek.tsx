import { useMemo, useState, type ReactNode } from 'react';
import { shortAmount } from '../../domain/analysis';
import { formatFt } from '../../domain/money';
import { shortDate } from '../../domain/periods';
import type { ISODate } from '../../domain/types';
import {
  avgName, billNames, dailyAverage, daysDescription, daysSentence, firstWeek, shiftWeek, splitSentence, weekdayName, WEEKDAYS_SHORT, weekRelative,
  weekSentence, weekStart, weekSummary, weekTitle, type WeekRow, type WeekSummary,
} from '../../domain/weekly';
import { useBudget } from '../context';
import { CatIcon, EmptyState, Icon } from '../components/common';

/** A kategórialistából alapból ennyi sor látszik. */
const TOP_ROWS = 8;
/** A „nem volt költés” mondat ennyi kategóriát sorol fel név szerint. */
const QUIET_NAMES = 6;

/** Az összeg „Ft” nélkül, a nagy szám és az oszlopok feliratához. */
const plain = (n: number) => formatFt(n).replace(/ Ft$/, '');

/**
 * Az Elemzés heti nézete: a hét költése a keretekből napra és kategóriára bontva, az előző hetek átlagához mérve.
 * A hétnek nincs saját terve, ezért itt nincs piros: borostyán jelzi, ami a szokásosnál több.
 */
export function AnalysisWeek({ tabs }: { tabs: ReactNode }) {
  const { data, summaries, cfg, today } = useBudget();
  // null: a mostani hetet követi, így hétfőn (nyitva hagyott appnál is) átlép az újra.
  const [selected, setSelected] = useState<ISODate | null>(null);
  const cur = weekStart(today);
  const first = useMemo(() => firstWeek(data.entries, today), [data.entries, today]);
  const start = selected !== null && selected >= first && selected < cur ? selected : cur;
  const w = useMemo(() => weekSummary(data, summaries, cfg, start, today), [data, summaries, cfg, start, today]);
  const move = (n: number) => {
    const next = shiftWeek(start, n);
    setSelected(next >= cur ? null : next);
  };

  return (
    <>
      <div className="page-head">
        {tabs}
        <div className="week-switch">
          <button className="btn icon" aria-label="Előző hét" disabled={start <= first} onClick={() => move(-1)}>
            <Icon name="chevron-left" />
          </button>
          <p className="week-label" aria-live="polite">
            <strong className="num">{weekTitle(start, today)}</strong>
            <span className="small faint">{weekRelative(start, today)}</span>
          </p>
          <button className="btn icon" aria-label="Következő hét" disabled={start >= cur} onClick={() => move(1)}>
            <Icon name="chevron-right" />
          </button>
          {start !== cur && (
            <button className="btn sm ghost" onClick={() => setSelected(null)}>
              Ugrás a mostanira
            </button>
          )}
        </div>
      </div>
      {w.split && (
        <div className="callout tone-accent">
          <Icon name="info-circle" />
          <span className="callout-text">{splitSentence(w.split, today)}</span>
        </div>
      )}
      <div className="week-top">
        <WeekTotal w={w} />
        <WeekDays w={w} />
      </div>
      <WeekCategories w={w} />
      <WeekBills w={w} />
      {w.monthly.length > 0 && (
        <p className="tiny muted week-note">
          A „Havi összeg megadása” rögzítései egy egész hónapot fednek le, ezért a heti bontásban nem szerepelnek. Ezt a hetet érinti:{' '}
          {w.monthly.map((c) => c.name).join(', ')}.
        </p>
      )}
    </>
  );
}

function WeekTotal({ w }: { w: WeekSummary }) {
  const s = weekSentence(w);
  return (
    <section className="week-sum" aria-label="A hét összege">
      <p className="week-sum-label">{w.current ? 'Ezen a héten eddig elment a keretekből' : 'A héten elment a keretekből'}</p>
      <p className="week-sum-value num">
        {plain(w.total)}
        <span className="week-sum-unit">Ft</span>
      </p>
      <p className="week-sum-text num">
        {s.strong && <strong className={s.warn ? 'warn-text' : ''}>{s.strong}</strong>} {s.rest}
      </p>
    </section>
  );
}

function WeekDays({ w }: { w: WeekSummary }) {
  const avg = dailyAverage(w);
  const top = Math.max(1, avg ?? 0, ...w.days.map((d) => d.amount));
  // Az oszlopok és a vonal magassága a --week-h arányában, hogy széles helyen a CSS megnövelhesse.
  const ratio = (v: number) => `calc(var(--week-h) * ${(v / top).toFixed(4)})`;
  const sentence = daysSentence(w);
  return (
    <section className="card week-days-card" aria-labelledby="week-days-title">
      <div className="card-head">
        <h2 id="week-days-title">Napról napra</h2>
      </div>
      <div className="week-days" role="img" aria-label={daysDescription(w)}>
        {w.days.map((d) => (
          <span key={d.date} className={`week-day ${d.state}${d.amount > 0 ? '' : ' zero'}`}>
            <span className="week-day-amount num">{d.amount > 0 ? (d.amount < 100_000 ? plain(d.amount) : shortAmount(d.amount)) : ''}</span>
            <span className="week-day-bar" style={{ height: ratio(d.amount) }} />
          </span>
        ))}
        {avg !== null && <span className="week-avg" style={{ bottom: ratio(avg) }} />}
      </div>
      <div className="week-day-names" aria-hidden="true">
        {w.days.map((d, i) => (
          <span key={d.date} className={d.state === 'today' ? 'on' : ''}>
            {WEEKDAYS_SHORT[i]}
          </span>
        ))}
      </div>
      {(sentence.strong || sentence.rest) && (
        <p className="small muted m-0 num">
          {sentence.strong && <strong className="week-days-strong">{sentence.strong}</strong>} {sentence.rest}
        </p>
      )}
    </section>
  );
}

function WeekCategories({ w }: { w: WeekSummary }) {
  const { openWeek, openQuick } = useBudget();
  const [all, setAll] = useState(false);
  // A sávok közös léptékűek, hogy a kategóriák egymáshoz is összevethetők legyenek.
  const scale = Math.max(1, ...w.rows.map((r) => Math.max(r.amount + r.fromSavings, r.avg ?? 0)));
  const shown = all ? w.rows : w.rows.slice(0, TOP_ROWS);
  const quiet = w.quiet.map((r) => r.cat.name);
  const fromSavings = w.rows.some((r) => r.fromSavings > 0);

  return (
    <section className="card" aria-labelledby="week-where-title">
      <div className="card-head">
        <div>
          <h2 id="week-where-title">Hova ment a pénz</h2>
          {w.rows.length > 0 && w.avgWeeks > 0 && <div className="small muted">A második szám {avgName(w.avgWeeks)}.</div>}
        </div>
      </div>
      {w.rows.length === 0 ? (
        <EmptyState
          icon="receipt-off"
          title={w.current ? 'Ezen a héten még nincs költés a keretekből' : 'A héten nem volt költés a keretekből'}
          action={
            w.current ? (
              <button className="btn sm primary" onClick={openQuick}>
                <Icon name="plus" /> Kiadás rögzítése
              </button>
            ) : undefined
          }
        />
      ) : (
        <ul className="where-list">
          {shown.map((r) => (
            <WeekCatRow key={r.cat.id} r={r} w={w} scale={scale} onOpen={() => openWeek(w.start, r.cat.id)} />
          ))}
        </ul>
      )}
      {w.rows.length > TOP_ROWS && (
        <button className="rec-more" aria-expanded={all} onClick={() => setAll(!all)}>
          <Icon name="chevron-right" className={`chev ${all ? 'open' : ''}`} />
          {all ? 'Kevesebb' : `Mind a ${w.rows.length} kategória`}
        </button>
      )}
      {w.rows.length > 0 && quiet.length > 0 && (
        <p className="tiny muted week-quiet">
          {w.current ? 'Ezen a héten még nem volt költés' : 'A héten nem volt költés'}: {quiet.slice(0, QUIET_NAMES).join(', ')}
          {quiet.length > QUIET_NAMES && ` és még ${quiet.length - QUIET_NAMES}`}.
        </p>
      )}
      {w.rows.length > 0 && (
        <div className="where-legend tiny muted">
          <span><span className="lg lg-actual" /> a hét költése</span>
          {w.rows.some((r) => r.more) && <span><span className="lg lg-more" /> a szokásosnál több</span>}
          {fromSavings && <span><span className="lg lg-savings" /> megtakarításból</span>}
          {w.avgWeeks > 0 && <span><span className="lg lg-plan" /> {avgName(w.avgWeeks)}</span>}
        </div>
      )}
    </section>
  );
}

function WeekCatRow({ r, w, scale, onOpen }: { r: WeekRow; w: WeekSummary; scale: number; onOpen: () => void }) {
  const pct = (v: number) => `${Math.min(100, (v / scale) * 100)}%`;
  const side = [
    w.current && r.left !== null
      ? r.left >= 0
        ? `a havi keretből maradt ${formatFt(r.left)}`
        : `a havi keret ${formatFt(-r.left)}-tal túllépve`
      : `${r.count} rögzítés`,
    r.fromSavings > 0 ? `megtakarításból ${formatFt(r.fromSavings)}` : '',
  ].filter(Boolean);
  const label =
    `${r.cat.name}: ${formatFt(r.amount)}` +
    (r.avg !== null ? `, ${avgName(r.avgWeeks)} ${formatFt(r.avg)}` : '') +
    (r.more ? ', a szokásosnál több' : '') +
    '. A hét rögzítéseinek megnyitása';
  return (
    <li>
      <button className="where-row" data-week-row={r.cat.id} onClick={onOpen} aria-label={label}>
        <CatIcon cat={r.cat} />
        <span className="where-main">
          <span className="where-line">
            <span className="where-name">{r.cat.name}</span>
            <span className="where-amt num">
              {formatFt(r.amount)}
              {r.avg !== null && <span className="faint"> / {formatFt(r.avg)}</span>}
            </span>
          </span>
          <span className="meter-wrap where-meter" aria-hidden="true">
            <span className="meter meter-lg">
              <span className={`meter-fill ${r.more ? 'is-more' : ''}`} style={{ width: pct(r.amount) }} />
              {r.fromSavings > 0 && <span className="meter-fill is-savings" style={{ width: pct(r.fromSavings) }} />}
            </span>
            {r.avg !== null && r.avg > 0 && <span className="meter-mark is-plan" style={{ left: pct(r.avg) }} />}
          </span>
          <span className="tiny muted num">{side.join(' · ')}</span>
        </span>
      </button>
    </li>
  );
}

function WeekBills({ w }: { w: WeekSummary }) {
  const [open, setOpen] = useState(false);
  if (w.bills.length === 0) return null;
  return (
    <section className="card week-bills" aria-label="A héten kifizetett számlák">
      <button className="week-bills-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="tile tile-md week-bills-icon">
          <Icon name="receipt" />
        </span>
        <span className="week-bills-main">
          <span className="week-bills-title">{w.current ? 'Számlák ezen a héten' : 'Számlák a héten'}</span>
          <span className="small muted">{billNames(w.bills)}. A fenti összegben nincs benne.</span>
        </span>
        <span className="num week-bills-sum">{formatFt(w.billsTotal)}</span>
        <Icon name="chevron-right" className={`chev ${open ? 'open' : ''}`} />
      </button>
      {open && (
        <ul className="week-entries week-bills-list">
          {w.bills.map((b) => (
            <li key={`${b.cat.id}|${b.date}`} className="week-entry">
              <CatIcon cat={b.cat} size="sm" />
              <span className="week-entry-main">
                <span className="week-entry-note">{b.cat.name}</span>
                <span className="tiny faint">
                  {weekdayName(b.date)}, {shortDate(b.date)}
                  {b.auto && ' · csoportos beszedés'}
                </span>
              </span>
              <span className="small num week-entry-amount">{formatFt(b.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
