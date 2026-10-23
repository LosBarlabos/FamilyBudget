import { useMemo } from 'react';
import { changeVsSameDay, type CategoryFigures, type PeriodSummary } from '../../domain/balance';
import { goalProgress } from '../../domain/goals';
import { formatFt, formatSigned } from '../../domain/money';
import { envelopeLeftText, envelopeView, paceOverview, reserveMonths, reserveText, type PaceOverview } from '../../domain/pace';
import { periodName, shiftPeriod } from '../../domain/periods';
import { cycleOf, isDuePeriod, nextDuePeriod } from '../../domain/plans';
import type { Category } from '../../domain/types';
import { displayUnits, type Unit } from '../../domain/units';
import { NEW_GOAL, useBudget } from '../context';
import { GoalRow } from '../components/Goals';
import { BalanceChart, SpendingChart } from '../components/Charts';
import { Bar, CatIcon, Delta, Icon, Stat, PACE_TONE, useLocalState, type BarTone } from '../components/common';
import { Hero } from '../components/Hero';
import { PeriodSwitcher } from '../components/PeriodSwitcher';
import { Todos } from '../components/Todos';

const SECTIONS: { title: string; match: (c: Category) => boolean }[] = [
  { title: 'Bevételek', match: (c) => c.type === 'bevetel' },
  { title: 'Kiadások', match: (c) => c.type === 'fix' || c.type === 'keret' },
  { title: 'Megtakarítás', match: (c) => c.type === 'megtakaritas' },
];

function sumFigs(cats: Category[], p: PeriodSummary | undefined): CategoryFigures | null {
  if (!p) return null;
  let plan = 0, actual = 0, counted = 0, any = false, settled = true;
  for (const c of cats) {
    const f = p.byCategory.get(c.id);
    if (!f) continue;
    any = true;
    plan += f.plan;
    actual += f.actual;
    counted += f.counted;
    settled &&= f.settled;
  }
  return any ? { plan, actual, counted, settled } : null;
}

export function Dashboard() {
  const { data, summaries, periodId, setPeriodId, go, today } = useBudget();
  const goals = useMemo(
    () =>
      data.categories
        .filter((c) => c.type === 'megtakaritas' && !c.archived)
        .sort((a, b) => a.order - b.order)
        .map((c) => ({ cat: c, g: goalProgress(c, data, summaries.currentId) })),
    [data, summaries.currentId],
  );
  const p = summaries.byId.get(periodId)!;
  const prev = summaries.byId.get(shiftPeriod(periodId, -1));
  const pace = useMemo(() => paceOverview(data.categories, p, today), [data.categories, p, today]);
  // A tartalék a mai állapotot írja le (az utolsó lezárt időszak végi egyenlege), ezért csak a folyamatban lévő
  // időszak kártyáján áll; egy régi vagy előre jelzett időszak egyenlege alatt ellentmondana az értéknek.
  const reserve = useMemo(
    () => (p.status === 'current' ? reserveText(reserveMonths(summaries)) : null),
    [summaries, p.status],
  );
  const [expanded, setExpanded] = useLocalState<string[]>('dashboard-expanded', []);
  const visible = data.categories.filter((c) => p.byCategory.has(c.id));

  const typeTotals = (type: Category['type'][]) =>
    sumFigs(visible.filter((c) => type.includes(c.type)), p) ?? { plan: 0, actual: 0, counted: 0, settled: false };
  // Ugyanaz az összeg, mint a célkártyákon: induló összeg + befizetések − felhasználás, mai állás szerint.
  const savedNow = goals.reduce((sum, x) => sum + x.g.saved, 0);
  const inc = typeTotals(['bevetel']);
  const exp = typeTotals(['fix', 'keret']);
  const sav = typeTotals(['megtakaritas']);
  const current = p.status === 'current';
  // A folyamatban lévő időszakban az eddigi bevétel, kiadás és félretétel a kiemelt kártyán áll, ezért a
  // KPI-sorban csak az egyenlegek maradnak.
  const heroStats = current
    ? [
        { label: 'Bevétel', value: formatFt(inc.actual), sub: `terv ${formatFt(inc.plan)}` },
        { label: 'Kiadás', value: formatFt(exp.actual), sub: `várható ${formatFt(p.expense)}` },
        ...(sav.plan > 0 || sav.actual > 0 ? [{ label: 'Félretéve', value: formatFt(sav.actual), sub: `terv ${formatFt(sav.plan)}` }] : []),
      ]
    : [];
  const future = p.status === 'future';

  return (
    <>
      <h1 className="sr-only">Áttekintés</h1>
      <div className="page-head">
        <PeriodSwitcher />
      </div>

      <Hero p={p} pace={pace} stats={heroStats} />
      {current && <Todos p={p} pace={pace} goals={goals} />}

      {/* A folyamatban lévő időszakban a bevétel és a kiadás az eddigi tény, a terv és a várható alul. */}
      <div className="stats">
        {!current && (
          <>
            <Stat label={future ? 'Bevétel (várható)' : 'Bevétel'} value={formatFt(p.income)} sub={`terv ${formatFt(inc.plan)}`} />
            <Stat label={future ? 'Kiadás (várható)' : 'Kiadás'} value={formatFt(p.expense)} sub={`terv ${formatFt(exp.plan)}`} />
          </>
        )}
        <Stat
          label={p.status === 'closed' ? 'Havi egyenleg' : 'Várható havi egyenleg'}
          value={formatSigned(p.net)}
          valueClass={p.net < 0 ? 'neg' : 'pos'}
          sub={p.savings > 0 ? `megtakarításra félretéve ${formatFt(p.savings)}` : undefined}
        />
        <Stat
          label="Futó egyenleg a végén"
          value={formatFt(p.endBalance)}
          valueClass={p.endBalance < 0 ? 'neg' : ''}
          sub={
            reserve || goals.length > 0 ? (
              <>
                {reserve && (
                  <span
                    className="stat-line"
                    title="Tartalék: az utolsó lezárt hónap végi egyenlege, az utolsó legfeljebb 3 lezárt hónap átlagos kiadásához mérve"
                  >
                    {reserve}
                  </span>
                )}
                {goals.length > 0 && <span className="stat-line">félretéve most: {formatFt(savedNow)}</span>}
              </>
            ) : undefined
          }
        />
      </div>

      <div className="grid-2 mb-4">
        <div className="card">
          <div className="card-head"><h2>Futó egyenleg</h2></div>
          <BalanceChart summaries={summaries} selectedId={periodId} onSelect={setPeriodId} />
        </div>
        <div className="card">
          <div className="card-head"><h2>Kiadások havonta</h2></div>
          <SpendingChart summaries={summaries} categories={data.categories} entries={data.entries} selectedId={periodId} onSelect={setPeriodId} />
        </div>
      </div>

      {goals.length > 0 && (
        <div className="card">
          <div className="card-head">
            <h2>Megtakarítás és célok</h2>
            <div className="cluster gap-3">
              <span className="small faint">mai állás</span>
              <button className="btn sm" onClick={() => go('categories', NEW_GOAL)}>
                <Icon name="plus" /> Új cél
              </button>
            </div>
          </div>
          {goals.map(({ cat, g }) => (
            <GoalRow
              key={cat.id}
              cat={cat}
              g={g}
              onClick={() => {
                setPeriodId(summaries.currentId);
                go('record', cat.id);
              }}
            />
          ))}
        </div>
      )}

      <div className="card">
        <div className="card-head">
          <h2>Kategóriák</h2>
          <span className="small faint">
            {p.status === 'future' ? 'Tervezett összegek · az előre rögzítetteknél tény / terv' : 'Tény / terv · kattints a rögzítéshez'}
          </span>
        </div>
        {SECTIONS.map((s) => {
          const units = displayUnits(visible.filter(s.match));
          if (units.length === 0) return null;
          return (
            <div key={s.title}>
              <div className="section-title">{s.title}</div>
              {units.map((u) => (
                <UnitRows
                  key={u.key}
                  unit={u}
                  p={p}
                  pace={pace}
                  prev={prev}
                  open={expanded.includes(u.key)}
                  toggle={() => setExpanded(expanded.includes(u.key) ? expanded.filter((k) => k !== u.key) : [...expanded, u.key])}
                />
              ))}
            </div>
          );
        })}
      </div>
    </>
  );
}

function UnitRows({
  unit, p, pace, prev, open, toggle,
}: { unit: Unit; p: PeriodSummary; pace: PaceOverview; prev?: PeriodSummary; open: boolean; toggle: () => void }) {
  const { go } = useBudget();
  const row = { p, pace };
  if (unit.categories.length === 1 && unit.key.startsWith('c:')) {
    const c = unit.categories[0];
    return <Row {...row} cats={[c]} label={c.name} figs={sumFigs([c], p)!} prevFigs={sumFigs([c], prev)} onClick={() => go('record', c.id)} />;
  }
  return (
    <>
      <Row
        {...row}
        cats={unit.categories}
        label={unit.name}
        count={unit.categories.length}
        figs={sumFigs(unit.categories, p)!}
        prevFigs={sumFigs(unit.categories, prev)}
        open={open}
        onClick={toggle}
      />
      {open &&
        unit.categories.map((c) => (
          <Row key={c.id} {...row} cats={[c]} label={c.name} figs={sumFigs([c], p)!} prevFigs={sumFigs([c], prev)} child onClick={() => go('record', c.id)} />
        ))}
    </>
  );
}

function Row({
  cats, label, figs, prevFigs, p, pace, onClick, open, count, child,
}: {
  /** A sorhoz tartozó kategóriák (csoportsornál mind): az ikon az elsőé, a delta és a tempó mindegyikből. */
  cats: Category[];
  label: string;
  figs: CategoryFigures;
  prevFigs: CategoryFigures | null;
  p: PeriodSummary;
  pace: PaceOverview;
  onClick: () => void;
  open?: boolean;
  count?: number;
  child?: boolean;
}) {
  const cat = cats[0];
  const ids = cats.map((c) => c.id);
  const income = cat.type === 'bevetel';
  // Jövőbeli időszakban a terv látszik; ha már előre rögzítettek (vagy lezártak) valamit, a tény/terv, mert
  // a futó egyenleg és a KPI is azzal számol (max(tény, terv), lezártnál a tény).
  const future = p.status === 'future';
  const planOnly = future && figs.actual === 0 && !figs.settled;
  // A sáv színe a tempót követi (keretnél a folyamatban lévő időszakban az eltelt időhöz mérve, máshol csak
  // a túllépés számít). Terv nélküli (pl. váratlan) kiadásnál nincs mihez képest túllépni.
  const view = envelopeView(cats, figs, pace.days, pace.current);
  // A nem havonta esedékes számlának (és az olyan csoportnak, amelynek egyik tagja sem esedékes) a köztes
  // hónapban 0 a terve, de ettől nem „nem tervezett”: a legközelebbi esedékességet mutatja.
  const notDue = figs.plan === 0 && figs.actual === 0 && cats.every((c) => c.type === 'fix' && cycleOf(c) > 1 && !isDuePeriod(c, p.id));
  const nextDue = notDue ? cats.map((c) => nextDuePeriod(c, p.id)).sort()[0] : null;
  const unplanned = figs.plan === 0 && !notDue;
  const tone: BarTone = income ? 'good' : unplanned ? 'accent' : PACE_TONE[view.pace];
  const envelopeRow = pace.current && !unplanned && cats.every((c) => c.type === 'keret');
  const { data, cfg, today } = useBudget();
  // A folyamatban lévő időszakban a tervet nincs értelme a múlt havi ténnyel összevetni: az eddigi tény az
  // előző időszak azonos napjáig tartó tényéhez mérődik.
  const sameDay = p.status === 'current' ? changeVsSameDay(data.entries, ids, p.id, today, cfg) : null;
  const change = sameDay
    ? sameDay.pct
    : prevFigs && prevFigs.counted > 0 ? Math.round(((figs.counted - prevFigs.counted) / prevFigs.counted) * 100) : null;
  const changeTitle = sameDay
    ? `Eddig ${formatFt(sameDay.current)}, az előző hónapban ugyaneddig ${formatFt(sameDay.previous)}`
    : undefined;

  return (
    <div
      className={`list-row ${child ? 'child' : ''}`}
      role="button"
      tabIndex={0}
      aria-expanded={count ? open : undefined}
      onClick={onClick}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onClick())}
    >
      <div className="name">
        {count !== undefined && <Icon name="chevron-right" className={`chev ${open ? 'open' : ''}`} />}
        <CatIcon cat={cat} />
        <span className="t">{label}</span>
        {count !== undefined && <span className="count">{count}</span>}
        {!future && <Delta pct={change} goodWhenUp={income} title={changeTitle} />}
      </div>
      <div className="barcell">
        {/* Terv és költés nélkül a sáv és a „ma” jelölő csak zaj lenne. */}
        {notDue ? null : planOnly ? (
          <Bar value={figs.plan} max={figs.plan} tone="plan" />
        ) : unplanned && figs.actual === 0 ? null : (
          <Bar value={figs.actual} max={unplanned ? figs.actual : figs.plan} tone={tone} marker={income ? null : view.marker} />
        )}
      </div>
      <div className="amounts num">
        {nextDue ? (
          <span className="faint">nem esedékes · legközelebb {periodName(nextDue).toLowerCase()}</span>
        ) : planOnly ? (
          <span className="muted">terv {formatFt(figs.plan)}</span>
        ) : (
          <>
            <span className={!income && view.pace === 'over' ? 'neg' : ''} style={{ fontWeight: 500 }}>{formatFt(figs.actual)}</span>
            <span className="faint">{unplanned ? ' · nem tervezett' : ` / ${formatFt(figs.plan)}`}</span>
            {envelopeRow && (
              <span className={`row-left ${view.pace === 'over' ? 'neg' : view.pace === 'fast' ? 'warn-text' : 'faint'}`}>
                {/* A szín mellett ikon és felolvasott szöveg is jelzi a gyors fogyást. */}
                {view.pace === 'fast' && (
                  <>
                    <Icon name="trending-up" /> <span className="sr-only">gyorsan fogy, </span>
                  </>
                )}
                {envelopeLeftText(view)}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
