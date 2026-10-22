import { formatFt } from './money';
import { periodRange, periodShortWithYear, shiftPeriod } from './periods';
import { effectivePlan, indexPlans } from './plans';
import type { BudgetData, Category, PeriodId, Settings } from './types';

export type GoalState = 'noTarget' | 'reached' | 'onTrack' | 'behind' | 'noPlan';

export interface GoalProgress {
  categoryId: string;
  /** Induló összeg + befizetések − felhasználás. */
  saved: number;
  deposited: number;
  withdrawn: number;
  target: number | null;
  pct: number | null;
  remaining: number | null;
  deadline: PeriodId | null;
  /** Hátralévő időszakok a határidőig, a folyamatban lévővel együtt. */
  periodsLeft: number | null;
  /**
   * Ennyit kell időszakonként félretenni, hogy a határidőre összegyűljön (ezresre felfelé kerekítve).
   * Ez pontosan az az „ettől a hónaptól” terv, amellyel a cél időben összejön: a mostani és a jövőbe előre
   * rögzített befizetés a terv része, ezért a hiányzóhoz hozzáadódik. Null, ha nincs hiány, nincs határidő,
   * vagy a határidőig már nincs nyitott időszak.
   */
  requiredMonthly: number | null;
  /** Az az időszak, amelynek a végére a jelenlegi terv szerint összegyűlik; null, ha a terv szerint soha. */
  projected: PeriodId | null;
  state: GoalState;
}

const HORIZON = 240;

export function isGoal(c: Category): boolean {
  return c.type === 'megtakaritas' && !!c.goalAmount && c.goalAmount > 0;
}

/**
 * A legkisebb havi terv, amellyel a nyitott időszakokban a hiányzó összegyűlik (ezresre felfelé kerekítve).
 * Egy időszakban csak a terv még be nem fizetett része gyűlik (max(0, terv − befizetés)), ezért egy előre
 * befizetett időszak csak akkor ad hozzá, ha a terv meghaladja a befizetését.
 */
export function requiredPlan(remaining: number, deposits: number[]): number | null {
  if (remaining <= 0 || deposits.length === 0) return null;
  const d = [...deposits].sort((a, b) => a - b);
  let sum = 0;
  for (let k = 1; k <= d.length; k++) {
    sum += d[k - 1];
    const r = (remaining + sum) / k;
    if (k === d.length || r <= d[k]) return Math.ceil(r / 1000) * 1000;
  }
  return null;
}

export function goalProgress(
  cat: Category,
  data: Pick<BudgetData, 'plans' | 'entries'> & { settings?: Pick<Settings, 'firstPeriodId'> },
  currentId: PeriodId,
): GoalProgress {
  let deposited = 0;
  let withdrawn = 0;
  const depositsByPeriod = new Map<PeriodId, number>();
  const settledPeriods = new Set<PeriodId>();
  for (const e of data.entries) {
    if (e.categoryId !== cat.id) continue;
    if (e.kind === 'withdrawal') {
      withdrawn += e.amount;
    } else {
      deposited += e.amount;
      depositsByPeriod.set(e.periodId, (depositsByPeriod.get(e.periodId) ?? 0) + e.amount);
      if (e.settles) settledPeriods.add(e.periodId);
    }
  }
  const saved = (cat.goalStart ?? 0) + deposited - withdrawn;
  const target = isGoal(cat) ? cat.goalAmount! : null;
  const deadline = target !== null ? (cat.goalDeadline ?? null) : null;

  const base: GoalProgress = {
    categoryId: cat.id, saved, deposited, withdrawn, target,
    pct: null, remaining: null, deadline, periodsLeft: null, requiredMonthly: null, projected: null,
    state: 'noTarget',
  };
  if (target === null) return base;

  const remaining = Math.max(0, target - saved);
  const pct = Math.min(100, Math.max(0, Math.round((saved / target) * 100)));
  const left = deadline ? periodRange(currentId, deadline) : null;
  const periodsLeft = left ? left.length : null;
  // A lezárt (settles) időszakban több nem gyűlik, a többiben a terv még be nem fizetett része.
  const open = (left ?? []).filter((p) => !settledPeriods.has(p));
  const requiredMonthly = requiredPlan(remaining, open.map((p) => depositsByPeriod.get(p) ?? 0));

  if (remaining === 0) {
    return { ...base, pct, remaining, periodsLeft, requiredMonthly: null, projected: currentId, state: 'reached' };
  }

  // A folyamatban lévő és a jövőbeli időszakokban a terv még be nem fizetett része gyűlik.
  const plans = indexPlans(data.plans.filter((p) => p.categoryId === cat.id));
  const firstId = data.settings?.firstPeriodId;
  let cum = saved;
  let projected: PeriodId | null = null;
  for (let i = 0, p = currentId; i < HORIZON; i++, p = shiftPeriod(p, 1)) {
    if (!settledPeriods.has(p)) cum += Math.max(0, effectivePlan(plans, cat, p, firstId) - (depositsByPeriod.get(p) ?? 0));
    if (cum >= target) {
      projected = p;
      break;
    }
  }

  let state: GoalState;
  if (deadline && (projected === null || projected > deadline)) state = 'behind';
  else if (projected === null) state = 'noPlan';
  else state = 'onTrack';

  return { ...base, pct, remaining, periodsLeft, requiredMonthly, projected, state };
}

/** Egy mondat a cél állásáról: mennyi hiányzik, mikor gyűlik össze, mennyi kell havonta. */
export function goalSummary(g: GoalProgress): string {
  if (g.state === 'noTarget') return g.withdrawn > 0 ? `célösszeg nélkül · felhasználva ${formatFt(g.withdrawn)}` : 'célösszeg nélkül';
  if (g.state === 'reached') return g.withdrawn > 0 ? `a cél összegyűlt · felhasználva ${formatFt(g.withdrawn)}` : 'a cél összegyűlt';
  const parts = [`még ${formatFt(g.remaining!)}`];
  if (g.deadline) {
    if (g.periodsLeft === 0) parts.push(`a határidő (${periodShortWithYear(g.deadline)}) lejárt`);
    else {
      parts.push(`határidő ${periodShortWithYear(g.deadline)}`);
      // A határidő időszakának befizetése már lezárult: addig több nem jön, havi összeg sem segít.
      parts.push(g.requiredMonthly === null ? 'a határidőig már nem gyűlik össze' : `havi ${formatFt(g.requiredMonthly)} kell`);
    }
  }
  parts.push(g.projected ? `a mostani tervvel ${periodShortWithYear(g.projected)}` : 'a mostani tervvel nem gyűlik össze');
  return parts.join(' · ');
}
