import { addDays, differenceInCalendarDays } from 'date-fns';
import { fromISO, makeConfig, MAX_PERIOD_RANGE, periodEnd, periodForDate, periodRange, periodStart, periodStatus, shiftPeriod, toISO } from './periods';
import type { PeriodConfig, PeriodStatus } from './periods';
import { cycleOf, indexPlans, scheduledPlan } from './plans';
import { autoPaidDue, dueDateInPeriod } from './status';
import type { BudgetData, Category, Entry, ISODate, PeriodId } from './types';
import { isExpense, recordStyle } from './types';

export interface CategoryFigures {
  plan: number;
  actual: number;
  /**
   * A futó egyenlegbe számított összeg: lezártnál tény, folyamatbannál és jövőbelinél max(tény, terv),
   * lezárt (settles) fix tételnél tény.
   */
  counted: number;
  /**
   * A fix tétel ebben az időszakban lezárult (van `settles` jelzős rögzítése). Keretként rögzülő kategóriánál
   * (pl. fix→keret váltás után) a régi jelző nem számít, mert ott nincs lezárás.
   */
  settled: boolean;
  /**
   * Csoportos beszedésű számla, amelynek elérkezett az esedékessége, de nincs rögzítése: a terv összegével
   * kifizetettnek számít (actual = plan, settled), rögzítés nélkül.
   */
  auto?: true;
}

export interface PeriodSummary {
  id: PeriodId;
  start: ISODate;
  end: ISODate;
  status: PeriodStatus;
  income: number;
  expense: number;
  savings: number;
  net: number;
  endBalance: number;
  savingsTotal: number;
  byCategory: Map<string, CategoryFigures>;
}

export interface Summaries {
  currentId: PeriodId;
  periods: PeriodSummary[];
  byId: Map<PeriodId, PeriodSummary>;
}

export const figKey = (periodId: PeriodId, categoryId: string) => `${periodId}|${categoryId}`;

export function actualsIndex(data: Pick<BudgetData, 'entries'>): Map<string, number> {
  const idx = new Map<string, number>();
  for (const e of data.entries) {
    if (e.kind === 'withdrawal') continue;
    const k = figKey(e.periodId, e.categoryId);
    idx.set(k, (idx.get(k) ?? 0) + e.amount);
  }
  return idx;
}

/** Azok az időszak|kategória kulcsok, amelyekben a fix tétel lezárult. */
export function settledIndex(data: Pick<BudgetData, 'entries'>): Set<string> {
  const idx = new Set<string>();
  for (const e of data.entries) if (e.settles && e.kind !== 'withdrawal') idx.add(figKey(e.periodId, e.categoryId));
  return idx;
}

/**
 * A jövőbe előre rögzített nagyobb tény is számít (max), különben az előrejelzés az időszak kezdetéig
 * optimistább lenne. A lezárt fix tételnél több nem jön, ezért ott a tény a végleges összeg.
 */
export function countedAmount(status: PeriodStatus, plan: number, actual: number, settled = false): number {
  if (status === 'closed' || settled) return actual;
  return Math.max(actual, plan);
}

export function computeSummaries(data: BudgetData, today: ISODate): Summaries {
  const { settings } = data;
  const cfg = makeConfig(settings.payday, data.overrides);
  const currentId = periodForDate(today, cfg);
  // Ha a fizetésnap vagy egy kezdőnap módosítása miatt a mai nap az első időszak elé esik, a folyamatban
  // lévő időszaknak akkor is szerepelnie kell, különben a képernyők nem találják.
  const startId = currentId < settings.firstPeriodId ? currentId : settings.firstPeriodId;
  const lastId = shiftPeriod(currentId > settings.firstPeriodId ? currentId : settings.firstPeriodId, settings.forecastPeriods);
  // Védőkorlát sérült adatra (képtelenül régi első időszak): a legrégebbi időszakok maradnak ki, nem a mostani.
  const earliest = shiftPeriod(lastId, -(MAX_PERIOD_RANGE - 1));
  const firstId = startId < earliest ? earliest : startId;
  const plans = indexPlans(data.plans);
  const actuals = actualsIndex(data);
  const settledKeys = settledIndex(data);

  let balance = settings.openingBalance;
  let savingsTotal = 0;
  const periods: PeriodSummary[] = [];

  for (const id of periodRange(firstId, lastId)) {
    const status = periodStatus(id, currentId);
    const start = periodStart(id, cfg);
    const end = periodEnd(id, cfg);
    const byCategory = new Map<string, CategoryFigures>();
    let income = 0;
    let expense = 0;
    let savings = 0;

    for (const c of data.categories) {
      const key = figKey(id, c.id);
      let actual = actuals.get(key) ?? 0;
      let settled = recordStyle(c) === 'fix' && settledKeys.has(key);
      // Archivált kategória a múltban a ténnyel még számít, a jövőre viszont már nincs terve.
      // A nem havonta esedékes számla köztes hónapjaiban 0 a terv.
      const plan = c.archived && status !== 'closed' ? 0 : scheduledPlan(plans, c, id, settings.firstPeriodId);
      // Csoportos beszedés: rögzítés nélkül az esedékességtől kifizetett; bármely kézi rögzítés felülírja.
      const auto = !actuals.has(key) && !settled && plan > 0 && autoPaidDue(c, id, start, end, today) !== null;
      if (auto) {
        actual = plan;
        settled = true;
      }
      if (c.archived && actual === 0) continue;
      const counted = countedAmount(status, plan, actual, settled);
      byCategory.set(c.id, auto ? { plan, actual, counted, settled, auto: true } : { plan, actual, counted, settled });
      if (c.type === 'bevetel') income += counted;
      else if (c.type === 'megtakaritas') savings += counted;
      else expense += counted;
    }

    const net = income - expense - savings;
    balance += net;
    savingsTotal += savings;
    periods.push({
      id,
      start,
      end,
      status,
      income,
      expense,
      savings,
      net,
      endBalance: balance,
      savingsTotal,
      byCategory,
    });
  }

  return { currentId, periods, byId: new Map(periods.map((p) => [p.id, p])) };
}

/**
 * A csoportos beszedés kikapcsolásakor ezek a rögzítés nélkül kifizetettnek számító számlák kapnak valódi,
 * lezáró rögzítést (az esedékesség napjával), hogy a múlt ne változzon meg.
 */
export function autoPaidPayments(s: Summaries, cat: Category): { periodId: PeriodId; amount: number; date: ISODate }[] {
  const out: { periodId: PeriodId; amount: number; date: ISODate }[] = [];
  for (const p of s.periods) {
    const f = p.byCategory.get(cat.id);
    const date = f?.auto && cat.dueDay ? dueDateInPeriod(cat.dueDay, p.start, p.end) : null;
    if (f && date) out.push({ periodId: p.id, amount: f.actual, date });
  }
  return out;
}

/** A megadott időszak előtti legfeljebb n lezárt időszak tényének átlaga. */
export function averageActual(s: Summaries, categoryId: string, beforeId: PeriodId, n = 3): number | null {
  const vals = s.periods
    .filter((p) => p.status === 'closed' && p.id < beforeId)
    .slice(-n)
    .map((p) => p.byCategory.get(categoryId)?.actual ?? 0);
  if (vals.length === 0) return null;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

/** Százalékos változás az előző időszakhoz képest (a futó egyenlegbe számított összegek alapján). */
export function changeVsPrevious(s: Summaries, categoryId: string, periodId: PeriodId): number | null {
  const prev = s.byId.get(shiftPeriod(periodId, -1))?.byCategory.get(categoryId)?.counted;
  const cur = s.byId.get(periodId)?.byCategory.get(categoryId)?.counted;
  if (prev === undefined || cur === undefined || prev === 0) return null;
  return Math.round(((cur - prev) / prev) * 100);
}

export interface SameDayChange {
  /** A folyamatban lévő időszak ténye a mai napig. */
  current: number;
  /** Az előző időszak ténye az időszakon belüli azonos napig. */
  previous: number;
  /** Százalékos változás; null, ha az előző időszakban addig nem volt tény. */
  pct: number | null;
}

/**
 * A folyamatban lévő időszakban a tervet nincs értelme a múlt havi ténnyel összevetni, ezért az eddigi tényt
 * az előző időszak ugyanannyiadik napjáig tartó tényével hasonlítja (a rögzítés dátuma alapján).
 */
export function changeVsSameDay(
  entries: Entry[],
  categoryIds: string[],
  periodId: PeriodId,
  today: ISODate,
  cfg: PeriodConfig,
): SameDayChange {
  const prevId = shiftPeriod(periodId, -1);
  const offset = Math.max(0, differenceInCalendarDays(fromISO(today), fromISO(periodStart(periodId, cfg))));
  const prevCutoff = toISO(addDays(fromISO(periodStart(prevId, cfg)), offset));
  const prevEnd = periodEnd(prevId, cfg);
  const cutoff = prevCutoff < prevEnd ? prevCutoff : prevEnd;
  const ids = new Set(categoryIds);
  let current = 0;
  let previous = 0;
  for (const e of entries) {
    if (e.kind === 'withdrawal' || !ids.has(e.categoryId)) continue;
    if (e.periodId === periodId && e.date <= today) current += e.amount;
    else if (e.periodId === prevId && e.date <= cutoff) previous += e.amount;
  }
  return { current, previous, pct: previous > 0 ? Math.round(((current - previous) / previous) * 100) : null };
}

export function totalsByType(cats: Category[], figs: Map<string, CategoryFigures>) {
  let plannedIncome = 0;
  let plannedExpense = 0;
  let plannedSavings = 0;
  for (const c of cats) {
    const f = figs.get(c.id);
    if (!f) continue;
    if (c.type === 'bevetel') plannedIncome += f.plan;
    else if (c.type === 'megtakaritas') plannedSavings += f.plan;
    else if (isExpense(c)) plannedExpense += f.plan;
  }
  return { plannedIncome, plannedExpense, plannedSavings, plannedNet: plannedIncome - plannedExpense - plannedSavings };
}

/**
 * A Tervező gyorskitöltése: a forrásidőszakok tényének átlaga. Csak fix és keret kategóriára fut (a bevétel
 * és a megtakarítás terve szándék, nem a múlt ismétlése), és null, ha a forrásidőszakokban nincs rögzítés,
 * hogy egy hiányzó adat ne nullázza a tervet.
 */
export function quickFillAmount(s: Summaries, entries: Entry[], cat: Category, sourceIds: PeriodId[]): number | null {
  // A nem havonta esedékes számla összegét az előző hónapok (többnyire 0) ténye nem mutatja.
  if (!isExpense(cat) || cycleOf(cat) > 1 || sourceIds.length === 0) return null;
  const src = new Set(sourceIds);
  if (!entries.some((e) => e.categoryId === cat.id && e.kind !== 'withdrawal' && src.has(e.periodId))) return null;
  const sum = sourceIds.reduce((a, id) => a + (s.byId.get(id)?.byCategory.get(cat.id)?.actual ?? 0), 0);
  return Math.round(sum / sourceIds.length);
}

/**
 * Első indításkor a „most a számlán lévő” összegből az időszak eleji nyitó egyenleg: amit ebben az időszakban
 * már kifizettünk vagy félretettünk, az az időszak elején még megvolt, a már megérkezett bevétel még nem.
 */
export function openingFromNow(balanceNow: number, done: { cat: Category; amount: number }[]): number {
  return done.reduce((b, d) => b + (d.cat.type === 'bevetel' ? -d.amount : d.amount), balanceNow);
}
