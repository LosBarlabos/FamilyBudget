import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  anchorPeriod, deviations, heatPeriods, heatTone, rangePeriods, savingsSpend, searchEntries, shortAmount, spendingRows, tagSummary,
  type AnalysisRange, type SpendRow,
} from '../../domain/analysis';
import type { PeriodSummary } from '../../domain/balance';
import { formatFt } from '../../domain/money';
import { periodName, periodShortLabel, shortDate } from '../../domain/periods';
import { isExpense, type Category, type Entry } from '../../domain/types';
import { displayUnits, type Unit } from '../../domain/units';
import { useBudget } from '../context';
import { CatIcon, Icon, useLocalState } from '../components/common';
import { PeriodSwitcher } from '../components/PeriodSwitcher';

export const RANGE_KEY = 'analysis-range';
const RANGES: { id: AnalysisRange; label: string }[] = [
  { id: 'period', label: 'Ez az időszak' },
  { id: 'last12', label: 'Utolsó 12' },
  { id: 'year', label: 'Naptári év' },
];
/** A „Hova ment a pénz” listából alapból ennyi sor látszik. */
const TOP_ROWS = 8;

export function Analysis() {
  const { data, summaries, periodId } = useBudget();
  const [range, setRange] = useLocalState<AnalysisRange>(RANGE_KEY, 'period');
  const spend = useMemo(() => savingsSpend(data.entries), [data.entries]);
  const periods = rangePeriods(summaries, periodId, range);
  const anchor = anchorPeriod(summaries, periodId);

  const rangeText =
    range === 'period'
      ? `${periodName(anchor.id, anchor.id.slice(0, 4) !== summaries.currentId.slice(0, 4))}${anchor.status === 'current' ? ', eddig' : ''}`
      : range === 'last12'
        ? `${periods.length} időszak: ${periodName(periods[0].id, true)} – ${periodName(anchor.id, true)}`
        : `${anchor.id.slice(0, 4)}, ${periods.length} időszak`;
  // A folyamatban lévő időszakból csak az eddigi tény van meg, a terve viszont teljes: ezt jelezni kell.
  const partial = range !== 'period' && anchor.status === 'current' ? ` (${periodName(anchor.id).toLowerCase()} eddig)` : '';

  return (
    <>
      <div className="page-head">
        <PeriodSwitcher />
        <div className="seg" role="group" aria-label="Időablak">
          {RANGES.map((r) => (
            <button key={r.id} className={range === r.id ? 'on' : ''} aria-pressed={range === r.id} onClick={() => setRange(r.id)}>
              {r.label}
            </button>
          ))}
        </div>
      </div>
      {anchor.id !== periodId && (
        <div className="banner info">
          <Icon name="info-circle" />
          <span className="grow">Jövőbeli időszaknak még nincs ténye, ezért az Elemzés a mostani időszakig mutatja az adatokat.</span>
        </div>
      )}
      <WhereMoneyWent periods={periods} spend={spend} rangeText={rangeText + partial} />
      <Deviations periods={periods} />
      <Heatmap periods={heatPeriods(summaries, periodId, range)} spend={spend} anchorId={anchor.id} />
      <SearchAndTags />
    </>
  );
}

type Spend = ReturnType<typeof savingsSpend>;

function WhereMoneyWent({ periods, spend, rangeText }: { periods: PeriodSummary[]; spend: Spend; rangeText: string }) {
  const { data, openTrend } = useBudget();
  const [all, setAll] = useState(false);
  const rows = useMemo(() => spendingRows(data.categories, periods, spend), [data.categories, periods, spend]);
  const total = rows.reduce((s, r) => s + r.actual + r.fromSavings, 0);
  const fromSavings = rows.reduce((s, r) => s + r.fromSavings, 0);
  // A sávok közös léptékűek, hogy a kategóriák egymáshoz is összevethetők legyenek.
  const scale = Math.max(1, ...rows.map((r) => Math.max(r.plan, r.actual + r.fromSavings)));
  const shown = all ? rows : rows.slice(0, TOP_ROWS);

  return (
    <section className="card" aria-labelledby="where-title">
      <div className="card-head where-head">
        <div>
          <h2 id="where-title">Hova ment a pénz</h2>
          <div className="small muted">{rangeText}</div>
        </div>
        <div className="where-total num">
          {formatFt(total)}
          {fromSavings > 0 && <div className="tiny muted">ebből megtakarításból {formatFt(fromSavings)}</div>}
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="small muted" style={{ margin: 0 }}>Ebben az időablakban még nincs kiadás.</p>
      ) : (
        <ul className="where-list">
          {shown.map((r) => (
            <WhereRow key={r.cat.id} r={r} scale={scale} onOpen={() => openTrend(`c:${r.cat.id}`)} />
          ))}
        </ul>
      )}
      {rows.length > TOP_ROWS && (
        <button className="rec-more" aria-expanded={all} onClick={() => setAll(!all)}>
          <Icon name="chevron-right" className={`chev ${all ? 'open' : ''}`} />
          {all ? 'Kevesebb' : `Mind a ${rows.length} kategória`}
        </button>
      )}
      <div className="where-legend tiny muted">
        <span><span className="lg lg-actual" /> havi pénzből</span>
        <span><span className="lg lg-savings" /> megtakarításból</span>
        <span><span className="lg lg-plan" /> terv</span>
      </div>
    </section>
  );
}

function WhereRow({ r, scale, onOpen }: { r: SpendRow; scale: number; onOpen: () => void }) {
  const over = r.plan > 0 && r.actual > r.plan;
  const unplanned = r.plan === 0 && r.actual > 0;
  const pct = (v: number) => `${Math.min(100, (v / scale) * 100)}%`;
  return (
    <li>
      <button className="where-row" onClick={onOpen} aria-label={`${r.cat.name}: ${formatFt(r.actual + r.fromSavings)}${r.plan ? `, terv ${formatFt(r.plan)}` : ''}. Trend megnyitása`}>
        <CatIcon cat={r.cat} />
        <span className="where-main">
          <span className="where-line">
            <span className="where-name">{r.cat.name}</span>
            <span className={`where-amt num ${over ? 'neg' : ''}`}>
              {formatFt(r.actual + r.fromSavings)}
              <span className="faint"> {r.plan > 0 ? `/ ${formatFt(r.plan)}` : unplanned || r.fromSavings ? '· nincs terv' : ''}</span>
            </span>
          </span>
          <span className="where-bar" aria-hidden="true">
            <span className={`wb-actual ${over ? 'over' : unplanned ? 'unplanned' : ''}`} style={{ width: pct(r.actual) }} />
            {r.fromSavings > 0 && <span className="wb-savings" style={{ width: pct(r.fromSavings) }} />}
            {r.plan > 0 && <span className="wb-plan" style={{ left: pct(r.plan) }} />}
          </span>
          {r.fromSavings > 0 && <span className="tiny muted num">ebből megtakarításból {formatFt(r.fromSavings)}</span>}
        </span>
      </button>
    </li>
  );
}

function Deviations({ periods }: { periods: PeriodSummary[] }) {
  const { data, go, openTrend } = useBudget();
  const list = useMemo(() => deviations(data.categories, periods), [data.categories, periods]);
  const closed = periods.filter((p) => p.status === 'closed').length;
  return (
    <section className="card" aria-labelledby="dev-title">
      <div className="card-head">
        <h2 id="dev-title">Legnagyobb eltérések a tervtől</h2>
        {closed > 0 && <span className="small faint">{closed} lezárt időszak alapján</span>}
      </div>
      {closed === 0 ? (
        <p className="small muted" style={{ margin: 0 }}>
          Az első lezárt időszak után jelenik meg: a folyamatban lévő hónapot még nincs mihez mérni. Addig az Áttekintés jelzi a gyorsan fogyó kereteket.
        </p>
      ) : list.length === 0 ? (
        <p className="small pos" style={{ margin: 0 }}>
          <Icon name="circle-check" /> Minden kategória a terv közelében maradt.
        </p>
      ) : (
        <ul className="dev-list">
          {list.map((d) => (
            <li key={d.cat.id} className="dev-row">
              <button className="dev-main" onClick={() => openTrend(`c:${d.cat.id}`)} aria-label={`${d.cat.name}: trend megnyitása`}>
                <CatIcon cat={d.cat} />
                <span className="dev-text">
                  <span className="dev-name">{d.cat.name}</span>
                  <span className="tiny muted num">
                    {d.kind === 'unplanned'
                      ? `nincs rá terv · ${d.periodsOver} időszakban költöttetek belőle`
                      : d.kind === 'over'
                        ? `${d.periodsOver} időszakban a terv fölött · ${shortAmount(d.actual)} / ${shortAmount(d.plan)}`
                        : `kevesebb ment el · ${shortAmount(d.actual)} / ${shortAmount(d.plan)}`}
                  </span>
                </span>
                <span className={`dev-diff num ${d.kind === 'under' ? 'pos' : d.kind === 'over' ? 'neg' : 'warn-text'}`}>
                  {d.diff > 0 ? '+' : '−'}
                  {formatFt(Math.abs(d.diff))}
                </span>
              </button>
              {d.kind !== 'under' && (
                <button className="icon dev-plan" title="Terv módosítása a Tervezőben" aria-label={`${d.cat.name}: terv módosítása a Tervezőben`} onClick={() => go('planner')}>
                  <Icon name="adjustments-horizontal" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const TONE_TEXT: Record<string, string> = {
  under: 'terv alatt', ok: 'a terv szerint', over: 'kicsit a terv fölött', 'way-over': 'jóval a terv fölött',
  unplanned: 'terv nélkül', current: 'folyamatban', none: '',
};

function Heatmap({ periods, spend, anchorId }: { periods: PeriodSummary[]; spend: Spend; anchorId: string }) {
  const { data, openTrend } = useBudget();
  const [openGroups, setOpenGroups] = useLocalState<string[]>('heat-open', []);
  // A legfrissebb időszak a jobb szélen van: keskeny képernyőn onnan induljon a görgetés.
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastId = periods.at(-1)?.id;
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [lastId, periods.length]);
  const units = useMemo(() => {
    const has = (c: Category) =>
      periods.some((p) => {
        const f = p.byCategory.get(c.id);
        return (f && (f.plan > 0 || f.actual > 0)) || (spend.get(c.id)?.get(p.id) ?? 0) > 0;
      });
    return displayUnits(data.categories.filter((c) => isExpense(c) && has(c)));
  }, [data.categories, periods, spend]);

  if (units.length === 0) return null;

  const cell = (cats: Category[], p: PeriodSummary) => {
    let plan = 0;
    let actual = 0;
    let fromSavings = 0;
    for (const c of cats) {
      const f = p.byCategory.get(c.id);
      plan += f?.plan ?? 0;
      actual += f?.actual ?? 0;
      fromSavings += spend.get(c.id)?.get(p.id) ?? 0;
    }
    const tone = heatTone(plan, actual, p.status === 'current');
    const title = `${periodName(p.id, true)}: ${formatFt(actual)}${plan ? ` / terv ${formatFt(plan)}` : ''}${fromSavings ? `, + ${formatFt(fromSavings)} megtakarításból` : ''}${TONE_TEXT[tone] ? ` (${TONE_TEXT[tone]})` : ''}`;
    return (
      <td key={p.id} className={`heat-cell t-${tone}`} title={title}>
        {actual + fromSavings > 0 ? shortAmount(actual + fromSavings) : '–'}
        {fromSavings > 0 && <span className="heat-sav" aria-hidden="true" />}
        <span className="sr-only">{title}</span>
      </td>
    );
  };

  const row = (u: Unit, key: string, label: string, cats: Category[], opts: { child?: boolean; group?: boolean } = {}) => {
    const open = openGroups.includes(u.key);
    return (
      <tr key={key} className={opts.child ? 'heat-child' : ''}>
        <th scope="row" className="heat-name">
          <span className="heat-name-in">
            {opts.group && (
              <button
                className="sm ghost icon"
                aria-expanded={open}
                aria-label={`${label}: ${open ? 'becsukás' : 'kategóriák mutatása'}`}
                onClick={() => setOpenGroups(open ? openGroups.filter((k) => k !== u.key) : [...openGroups, u.key])}
              >
                <Icon name="chevron-right" className={`chev ${open ? 'open' : ''}`} />
              </button>
            )}
            <button className="heat-label" onClick={() => openTrend(key)} title={`${label}: trend`}>
              {label}
            </button>
          </span>
        </th>
        {periods.map((p) => cell(cats, p))}
      </tr>
    );
  };

  return (
    <section className="card" aria-labelledby="heat-title">
      <div className="card-head">
        <h2 id="heat-title">Időszakonként</h2>
        <span className="small faint">koppints egy sorra a trendért</span>
      </div>
      <div className="heat-scroll" ref={scrollRef} tabIndex={0} aria-label="Kategóriák időszakonként, görgethető táblázat">
        <table className="heat">
          <thead>
            <tr>
              <th scope="col" className="heat-name"><span className="sr-only">Kategória</span></th>
              {periods.map((p) => (
                <th key={p.id} scope="col" className={p.id === anchorId ? 'on' : ''}>
                  {periodShortLabel(p.id, anchorId)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {units.map((u) => {
              const group = u.key.startsWith('g:');
              if (!group) return row(u, u.key, u.name, u.categories);
              return [
                row(u, u.key, u.name, u.categories, { group: true }),
                ...(openGroups.includes(u.key) ? u.categories.map((c) => row(u, `c:${c.id}`, c.name, [c], { child: true })) : []),
              ];
            })}
          </tbody>
        </table>
      </div>
      <div className="heat-legend tiny muted">
        <span><span className="lg t-under" /> ≤ 90%</span>
        <span><span className="lg t-ok" /> 90–100%</span>
        <span><span className="lg t-over" /> 100–115%</span>
        <span><span className="lg t-way-over" /> &gt; 115%</span>
        <span><span className="lg t-unplanned" /> terv nélkül</span>
        <span><span className="lg t-current" /> folyamatban</span>
      </div>
    </section>
  );
}

const RESULT_LIMIT = 50;

function SearchAndTags() {
  const { data } = useBudget();
  const [q, setQ] = useState('');
  const tags = useMemo(() => tagSummary(data.entries), [data.entries]);
  const results = useMemo(() => searchEntries(data.entries, data.categories, q, RESULT_LIMIT + 1), [data.entries, data.categories, q]);
  const cats = useMemo(() => new Map(data.categories.map((c) => [c.id, c])), [data.categories]);
  const sum = results.slice(0, RESULT_LIMIT).reduce((s, e) => s + e.amount, 0);

  return (
    <section className="card" aria-labelledby="search-title">
      <div className="card-head">
        <h2 id="search-title">Keresés és címkék</h2>
      </div>
      <label className="search-box">
        <Icon name="search" />
        <span className="sr-only">Keresés a rögzítésekben</span>
        <input type="search" placeholder="Megjegyzés, kategória, név vagy #címke" value={q} onChange={(e) => setQ(e.target.value)} />
        {q && (
          <button className="sm ghost icon" aria-label="Keresés törlése" onClick={() => setQ('')}>
            <Icon name="x" />
          </button>
        )}
      </label>
      {!q.trim() ? (
        tags.length === 0 ? (
          <p className="small muted" style={{ margin: '10px 0 0' }}>
            Írj címkét a megjegyzésbe, pl. <strong>#nyaralás</strong> vagy <strong>#autó</strong>, és itt összesítve látod, mennyi ment el rá.
          </p>
        ) : (
          <div className="tag-list">
            {tags.map((t) => (
              <button key={t.tag} className="tag-chip" onClick={() => setQ(`#${t.tag}`)}>
                <span className="tag-name">#{t.tag}</span>
                <span className="num">{formatFt(t.total)}</span>
                <span className="faint num">{t.count} db</span>
              </button>
            ))}
          </div>
        )
      ) : results.length === 0 ? (
        <p className="small muted" style={{ margin: '10px 0 0' }}>Nincs találat.</p>
      ) : (
        <>
          <p className="small muted num" style={{ margin: '10px 0 4px' }} role="status">
            {results.length > RESULT_LIMIT ? `Az első ${RESULT_LIMIT} találat` : `${results.length} találat`} · összesen {formatFt(sum)}
          </p>
          <ul className="recent-list">
            {results.slice(0, RESULT_LIMIT).map((e) => (
              <ResultRow key={e.id} e={e} cat={cats.get(e.categoryId)} spendName={e.spendCategoryId ? cats.get(e.spendCategoryId)?.name : undefined} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function ResultRow({ e, cat, spendName }: { e: Entry; cat?: Category; spendName?: string }) {
  const name = cat?.name ?? 'Ismeretlen kategória';
  return (
    <li className="recent-row search-row">
      <CatIcon cat={cat ?? { icon: 'question-mark', color: '#8a8983' }} />
      <div className="recent-main">
        <div className="small recent-name">
          {name}
          {e.note && <span className="muted"> · {e.note}</span>}
        </div>
        <div className="tiny faint">
          {shortDate(e.date)}
          {e.createdBy && ` · ${e.createdBy}`}
          {e.kind === 'withdrawal' && ` · megtakarításból${spendName ? ` → ${spendName}` : ''}`}
        </div>
      </div>
      <span className="small num">{formatFt(e.amount)}</span>
    </li>
  );
}
