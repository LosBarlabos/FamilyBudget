import { useEffect, useMemo, useState, useRef } from 'react';
import { averageActual, computeSummaries, quickFillAmount, totalsByType } from '../../domain/balance';
import { goalProgress, goalSummary, type GoalProgress } from '../../domain/goals';
import { formatFt, formatSigned, parseAmount } from '../../domain/money';
import { periodName, periodShortLabel, shiftPeriod } from '../../domain/periods';
import {
  applyPlanOps, cycleLabel, cycleOf, effectivePlan, indexPlans, isDuePeriod, laterPlanChanges, nextDuePeriod, planChangeOps, planChangeSummary,
  type PlanMode,
} from '../../domain/plans';
import type { Category, PeriodId, Plan } from '../../domain/types';
import { changePlan, replacePlans, restorePlansOf, snapshotPlans } from '../../db/repo';
import { useBudget, useSafe, useToast } from '../context';
import { negativeOutlook, negativeOutlookText, outlookSentence } from '../../domain/overview';
import { BalanceChart } from '../components/Charts';
import { CatIcon, Icon, Segmented } from '../components/common';
import { GoalStateChip } from '../components/Goals';
import { PeriodSwitcher } from '../components/PeriodSwitcher';

const SECTIONS: { title: string; match: (c: Category) => boolean }[] = [
  { title: 'Bevételek', match: (c) => c.type === 'bevetel' },
  { title: 'Fix számlák', match: (c) => c.type === 'fix' },
  { title: 'Keretek', match: (c) => c.type === 'keret' },
  { title: 'Megtakarítás', match: (c) => c.type === 'megtakaritas' },
];

interface Draft {
  catId: string;
  amount: number;
}


const MODES: { id: PlanMode; label: string }[] = [
  { id: 'from', label: 'Ettől a hónaptól' },
  { id: 'only', label: 'Csak erre a hónapra' },
];
export function Planner() {
  const { data, summaries, periodId, setPeriodId, today } = useBudget();
  const toast = useToast();
  const safe = useSafe();
  // Szándékosan nem marad meg: minden megnyitáskor „Ettől a hónaptól”, hogy egy régi „csak erre” ne lepjen meg.
  const [mode, setMode] = useState<PlanMode>('from');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [baseline, setBaseline] = useState<Map<PeriodId, number> | null>(null);
  const active = data.categories.filter((c) => !c.archived);

  // A változás előtti előrejelzés: időszakváltáskor rögzítjük, ehhez viszonyítunk szerkesztés közben.
  useEffect(() => {
    setBaseline(new Map(summaries.periods.map((p) => [p.id, p.endBalance])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodId]);

  const previewPlans = useMemo(() => {
    if (!draft) return data.plans;
    const cat = data.categories.find((c) => c.id === draft.catId)!;
    return applyPlanOps(data.plans, planChangeOps(data.plans, cat, periodId, draft.amount, mode));
  }, [draft, data.plans, data.categories, periodId, mode]);

  const preview = useMemo(
    () => (previewPlans === data.plans ? summaries : computeSummaries({ ...data, plans: previewPlans }, today)),
    [previewPlans, data, summaries, today],
  );

  // A célok előrejelzése is a húzás közbeni tervvel számol.
  const goals = useMemo(() => {
    const m = new Map<string, GoalProgress>();
    for (const c of data.categories) {
      if (c.type === 'megtakaritas') {
        m.set(c.id, goalProgress(c, { entries: data.entries, plans: previewPlans, settings: data.settings }, summaries.currentId));
      }
    }
    return m;
  }, [data.categories, data.entries, data.settings, previewPlans, summaries.currentId]);

  const p = preview.byId.get(periodId)!;
  const committed = summaries.byId.get(periodId)!;
  const totals = totalsByType(active, p.byCategory);
  const changed = baseline !== null && preview.periods.some((x) => baseline.get(x.id) !== x.endBalance);

  // Az idővonal összegzése a húzás közbeni tervvel: a mélypont, a terv vége, és hogy mennyit változott.
  const outlook = outlookSentence(preview);
  const neg = negativeOutlook(preview);
  const negText = neg ? negativeOutlookText(neg, { inPlanner: true }) : null;
  const lastP = preview.periods.at(-1)!;
  const endDelta = lastP.endBalance - (baseline?.get(lastP.id) ?? lastP.endBalance);

  const prevId = shiftPeriod(periodId, -1);
  const prevSummary = summaries.byId.get(prevId);

  const commit = (cat: Category, amount: number, modeOverride?: PlanMode, target: PeriodId = periodId) =>
    safe(async () => {
      const m = modeOverride ?? mode;
      // Kifejezett módnál akkor is írunk, ha ez a hónap már egyezik: a későbbi hónapok eltérhetnek.
      if (modeOverride || amount !== summaries.byId.get(target)?.byCategory.get(cat.id)?.plan) {
        const msg = planChangeSummary(data.plans, cat, target, amount, m);
        const before = await changePlan(cat, target, amount, m);
        toast(msg, () => restorePlansOf(cat.id, before));
      }
    }).finally(() => setDraft(null));

  const bulk = (label: string, amountOf: (c: Category) => number | null) =>
    safe(async () => {
      const before = await snapshotPlans();
      let n = 0;
      try {
        for (const c of active) {
          const v = amountOf(c);
          if (v === null || v === committed.byCategory.get(c.id)?.plan) continue;
          await changePlan(c, periodId, v, mode);
          n++;
        }
      } catch (e) {
        // Félbeszakadt kitöltés: a már átírt tervek visszaállnak, hogy ne maradjon félkész állapot.
        await replacePlans(before);
        throw e;
      }
      toast(n ? `${label}: ${n} kategória frissítve` : 'Nem volt mit módosítani', n ? () => replacePlans(before) : undefined);
    });

  const closedBefore = summaries.periods.filter((x) => x.status === 'closed' && x.id < periodId);
  const lastClosed = closedBefore.at(-1);
  const last3 = closedBefore.slice(-3).map((x) => x.id);
  const planIdx = indexPlans(data.plans);
  // Nem havonta esedékes számlánál a havi átlag félrevezető: a legutóbbi esedékesség ténye látszik helyette.
  const cycleText = (c: Category) => {
    const last = closedBefore.findLast((x) => isDuePeriod(c, x.id));
    const tail = last ? ` · legutóbb ${periodName(last.id, true)}: ${formatFt(last.byCategory.get(c.id)?.actual ?? 0)}` : '';
    return `${cycleLabel(cycleOf(c))}${tail}`;
  };

  return (
    <>
      <h1 className="sr-only">Tervező</h1>
      <div className="page-head">
        <PeriodSwitcher />
        <div className="cluster wrap gap-2">
          <Segmented label="Módosítás hatálya" options={MODES} value={mode} onChange={setMode} />
        </div>
      </div>

      <div className="planner">
        <div>
          {/* Telefonon a grafikon a lista fölött marad: a sáv húzás közben is mutatja, mit változtat a terv. */}
          <div className="plan-bar num" aria-hidden="true">
            <span>
              Havi egyenleg <strong className={totals.plannedNet < 0 ? 'neg' : 'pos'}>{formatSigned(totals.plannedNet)}</strong>
            </span>
            <span>
              A terv végén <strong className={lastP.endBalance < 0 ? 'neg' : ''}>{formatFt(lastP.endBalance)}</strong>
              {changed && endDelta !== 0 && <span className={endDelta < 0 ? 'neg' : 'pos'}> ({formatSigned(endDelta)})</span>}
            </span>
          </div>
          <div className="card cluster wrap gap-2">
            <span className="small muted" style={{ marginRight: 'auto' }} title="Csak a fix számlák és a keretek tervét írja át, és csak ott, ahol volt rögzítés">
              Gyors kitöltés (fix és keret)
            </span>
            <button
              className="btn sm"
              disabled={!lastClosed}
              title={lastClosed ? `${periodName(lastClosed.id)} tényleges összegei` : 'Még nincs lezárt hónap'}
              onClick={() => lastClosed && bulk('Előző hónap alapján', (c) => quickFillAmount(summaries, data.entries, c, [lastClosed.id]))}
            >
              <Icon name="history" /> Előző hónap tényei alapján
            </button>
            <button
              className="btn sm"
              disabled={!lastClosed}
              title={lastClosed ? 'Az utolsó legfeljebb 3 lezárt hónap átlaga' : 'Még nincs lezárt hónap'}
              onClick={() => bulk('3 havi átlag alapján', (c) => quickFillAmount(summaries, data.entries, c, last3))}
            >
              <Icon name="chart-line" /> 3 havi átlag alapján
            </button>
          </div>

          {SECTIONS.map((s) => {
            const cats = active.filter(s.match);
            if (cats.length === 0) return null;
            return (
              <div className="card" key={s.title}>
                <div className="card-head">
                  <h2>{s.title}</h2>
                  <span className="small num muted">
                    {formatFt(cats.reduce((sum, c) => sum + (p.byCategory.get(c.id)?.plan ?? 0), 0))}
                  </span>
                </div>
                {cats.map((c) =>
                  !isDuePeriod(c, periodId) ? (
                    <OffCycleRow
                      key={`${c.id}-${periodId}`}
                      cat={c}
                      next={nextDuePeriod(c, periodId)}
                      amount={effectivePlan(planIdx, c, nextDuePeriod(c, periodId), data.settings.firstPeriodId)}
                      onGo={setPeriodId}
                    />
                  ) : (
                  <PlanRow
                    key={`${c.id}-${periodId}`}
                    cat={c}
                    value={draft?.catId === c.id ? draft.amount : (committed.byCategory.get(c.id)?.plan ?? 0)}
                    committedValue={committed.byCategory.get(c.id)?.plan ?? 0}
                    prevActual={prevSummary?.status === 'closed' ? (prevSummary.byCategory.get(c.id)?.actual ?? 0) : null}
                    avg={averageActual(summaries, c.id, periodId)}
                    onDraft={(amount) => setDraft({ catId: c.id, amount })}
                    onCommit={(amount, m) => commit(c, amount, m)}
                    goal={goals.get(c.id)}
                    currentId={summaries.currentId}
                    currentPlan={summaries.byId.get(summaries.currentId)?.byCategory.get(c.id)?.plan ?? 0}
                    onApplyGoal={(amount) => commit(c, amount, 'from', summaries.currentId)}
                    later={laterPlanChanges(data.plans, c, periodId)}
                    periodId={periodId}
                    cycleText={cycleOf(c) > 1 ? cycleText(c) : undefined}
                  />
                  ),
                )}
              </div>
            );
          })}
        </div>

        <aside className="planner-side">
          <div className="card">
            <h2 className="mb-3">{periodName(periodId)} terve</h2>
            <dl className="sumlist num">
              <dt>Bevétel</dt><dd>{formatFt(totals.plannedIncome)}</dd>
              <dt>Kiadás</dt><dd>−{formatFt(totals.plannedExpense)}</dd>
              <dt>Megtakarítás</dt><dd>−{formatFt(totals.plannedSavings)}</dd>
              <dt className="total">Tervezett havi egyenleg</dt>
              <dd className={`total ${totals.plannedNet < 0 ? 'neg' : 'pos'}`}>{formatSigned(totals.plannedNet)}</dd>
            </dl>
            {totals.plannedNet < 0 && (
              <div className="callout tone-warn" style={{ margin: '12px 0 0', padding: '8px 12px' }}>
                <Icon name="alert-triangle" />
                <span className="grow small">A terv szerint ebben a hónapban több megy el, mint amennyi bejön.</span>
              </div>
            )}
          </div>
          <div className="card">
            <div className="card-head">
              <h2>Futó egyenleg</h2>
              <span className="small num">{formatFt(p.endBalance)}</span>
            </div>
            {negText ? (
              <div className="callout tone-danger plan-outlook">
                <Icon name="chart-line" />
                <span className="callout-text num">
                  <strong>{negText.title}</strong> {negText.sub}
                </span>
              </div>
            ) : (
              outlook && <p className="small muted num plan-outlook">{outlook}</p>
            )}
            <BalanceChart summaries={preview} selectedId={periodId} onSelect={setPeriodId} baseline={changed ? baseline : null} height={200} />
            {changed && (
              <div className="cluster gap-2 mt-2" style={{ justifyContent: 'space-between' }}>
                <span className="small muted">
                  A terv végén a változás:{' '}
                  <span className={`num ${endDelta < 0 ? 'neg' : 'pos'}`}>{formatSigned(endDelta)}</span>
                </span>
                <button className="btn sm ghost" onClick={() => setBaseline(new Map(summaries.periods.map((x) => [x.id, x.endBalance])))}>
                  Összevetés nullázása
                </button>
              </div>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}

function niceMax(...vals: number[]) {
  const m = Math.max(50_000, ...vals);
  const step = m > 500_000 ? 50_000 : 10_000;
  return Math.ceil(m / step) * step;
}

/** Nem havonta esedékes számla egy köztes hónapban: nincs mit tervezni, csak a következő esedékesség látszik. */
function OffCycleRow({ cat, next, amount, onGo }: { cat: Category; next: PeriodId; amount: number; onGo: (id: PeriodId) => void }) {
  return (
    <div className="plan-row off-cycle">
      <div className="plan-name">
        <CatIcon cat={cat} />
        <div style={{ minWidth: 0 }}>
          <div className="rec-name">{cat.name}</div>
          <div className="tiny faint num">
            {cycleLabel(cycleOf(cat))} · ebben a hónapban nem esedékes
          </div>
        </div>
      </div>
      <button className="btn sm ghost num" onClick={() => onGo(next)} title={`${periodName(next, true)} tervének megnyitása`}>
        {periodName(next)}: {formatFt(amount)} <Icon name="chevron-right" />
      </button>
    </div>
  );
}

function PlanRow({
  cat, value, committedValue, prevActual, avg, onDraft, onCommit, goal, later, periodId, currentId, currentPlan, onApplyGoal, cycleText,
}: {
  /** Nem havonta esedékes számla: a havi tények helyett a gyakoriság és a legutóbbi esedékesség. */
  cycleText?: string;
  goal?: GoalProgress;
  currentId: PeriodId;
  /** A mostani időszak terve: a cél javaslata ehhez mérődik. */
  currentPlan: number;
  /**
   * A cél javasolt havi összegét a mostani időszaktól állítja be: a javaslat onnan számol, ezért akkor is
   * onnan kell érvényesnek lennie, ha a Tervezőben egy későbbi időszak van kiválasztva.
   */
  onApplyGoal: (amount: number) => void;
  /** A kategória későbbi egyedi tervei; „ettől a hónaptól” mentésnél ezek törlődnek. */
  later: Plan[];
  periodId: PeriodId;
  cat: Category;
  value: number;
  committedValue: number;
  prevActual: number | null;
  avg: number | null;
  onDraft: (v: number) => void;
  onCommit: (v: number, mode?: PlanMode) => void;
}) {
  // A mentett értékből számol, így húzás közben (amikor csak a vázlat változik) nem mozdul el a skála.
  const max = useMemo(
    () => niceMax(committedValue * 2, (avg ?? 0) * 1.5, (prevActual ?? 0) * 1.5),
    [committedValue, avg, prevActual],
  );
  const [text, setText] = useState<string | null>(null);
  // Csak a ténylegesen átírt mező ment kilépéskor: egy mentés közben újra fókuszált mező még a régi
  // értéket mutathatja, és az érintetlen kilépés különben visszaírná azt.
  const edited = useRef(false);
  const [error, setError] = useState('');
  const step = max > 300_000 ? 5000 : 1000;
  const sliderMax = Math.max(max, value);

  const commitText = () => {
    if (text === null) return;
    if (!edited.current) {
      setText(null);
      return;
    }
    const v = text.trim() === '0' ? 0 : parseAmount(text);
    if (v === null) {
      setError('Ez nem érvényes összeg');
      return;
    }
    setText(null);
    edited.current = false;
    onCommit(v);
  };

  return (
    <div className="plan-row">
      <div className="plan-name">
        <CatIcon cat={cat} />
        <div style={{ minWidth: 0 }}>
          <div className="rec-name">{cat.name}</div>
          <div className="tiny faint num">
            {cycleText ?? (
              <>
                {prevActual !== null && <>előző tény {formatFt(prevActual)}</>}
                {prevActual !== null && avg !== null && ' · '}
                {avg !== null && <>3 havi átlag {formatFt(avg)}</>}
                {prevActual === null && avg === null && 'még nincs tényadat'}
              </>
            )}
          </div>
          {later.length > 0 && (
            <div className="tiny num later-plans" title="Későbbi egyedi terv; „Ettől a hónaptól” mentésnél törlődik">
              <Icon name="calendar-event" />
              {later.slice(0, 3).map((p) => `${periodShortLabel(p.periodId, periodId)}: ${formatFt(p.amount)}`).join(' · ')}
              {later.length > 3 && ` · és még ${later.length - 3}`}
            </div>
          )}
        </div>
      </div>
      <input
        type="range"
        min={0}
        max={sliderMax}
        step={step}
        value={value}
        aria-label={`${cat.name} terve`}
        onChange={(e) => onDraft(Number(e.target.value))}
        onPointerUp={(e) => onCommit(Number((e.target as HTMLInputElement).value))}
        onKeyUp={(e) => onCommit(Number((e.target as HTMLInputElement).value))}
      />
      <div>
        <input
          type="text"
          inputMode="numeric"
          className="sm num"
          style={{ width: 120, textAlign: 'right' }}
          aria-label={`${cat.name} tervezett összege`}
          aria-invalid={!!error}
          value={text ?? formatFt(value)}
          onFocus={(e) => {
            setText(String(value));
            edited.current = false;
            requestAnimationFrame(() => e.target.select());
          }}
          onChange={(e) => {
            setText(e.target.value);
            edited.current = true;
            setError('');
          }}
          onBlur={commitText}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              setText(null);
              setError('');
            }
          }}
        />
        {error && <div className="error">{error}</div>}
      </div>
      {goal && goal.state !== 'noTarget' && (
        <div className="goal-hint tiny muted num">
          <GoalStateChip state={goal.state} />
          <span>{goalSummary(goal)}</span>
          {goal.requiredMonthly !== null && (goal.state === 'behind' || goal.requiredMonthly !== currentPlan) && (
            <button
              className="btn sm ghost"
              title={`A mostani hónaptól (${periodName(currentId).toLowerCase()}) minden hónapra`}
              onClick={() => onApplyGoal(goal.requiredMonthly!)}
            >
              Terv: havi {formatFt(goal.requiredMonthly)}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
