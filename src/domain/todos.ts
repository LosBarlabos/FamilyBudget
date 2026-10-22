import { differenceInCalendarDays } from 'date-fns';
import type { PeriodSummary } from './balance';
import type { GoalProgress } from './goals';
import { formatFt } from './money';
import { usedPct, type EnvelopeStatus, type PaceOverview } from './pace';
import { fromISO, shortDate, toISO } from './periods';
import { dueDateInPeriod, fixStatus } from './status';
import { recordStyle, type Category, type Entry, type ISODate } from './types';

export type Todo =
  /** Lejárt vagy hamarosan esedékes, még le nem zárt fix számla; amount a hátralék. */
  | { kind: 'bill'; cat: Category; amount: number; partial: boolean; due: ISODate; overdue: boolean }
  /** Egyösszegű bevétel, ami az időszak elején még nem (vagy nem teljesen) érkezett meg. */
  | { kind: 'income'; cat: Category; amount: number; partial: boolean }
  /** Túlfutó keret, vagy terv nélküli keret, amelyből mégis költöttetek (pace: 'ok', plan: 0). */
  | { kind: 'envelope'; env: EnvelopeStatus }
  | { kind: 'goal'; cat: Category; goal: GoalProgress }
  | { kind: 'idle'; days: number }
  | { kind: 'backup'; days: number | null };

/** Az Áttekintésen legfeljebb ennyi teendő látszik. */
export const MAX_TODOS = 5;
/** Ennyi napon belül esedékes számla már teendő. */
export const DUE_SOON_DAYS = 5;
/** Az egyösszegű bevétel az időszak ennyiedik napja után számít későnek. */
export const INCOME_GRACE_DAYS = 3;
/** Ennél több nap rögzítés nélkül már emlékeztet. */
export const IDLE_DAYS = 4;
/** Legfeljebb ennyi keret kerül a teendők közé. */
const MAX_ENVELOPES = 2;

export interface TodoInput {
  categories: Category[];
  entries: Entry[];
  /** A folyamatban lévő időszak. */
  period: PeriodSummary;
  pace: PaceOverview;
  today: ISODate;
  goals: { cat: Category; g: GoalProgress }[];
  /** A költségvetés létrehozása: rögzítés nélkül ettől számít a tétlenség. */
  createdAt: string;
  backup: { stale: boolean; days: number | null };
}

/** Hány napja nem volt rögzítés (a legutóbbi rögzítés ideje szerint, annak hiányában a létrehozástól). */
export function daysSinceLastEntry(entries: Entry[], createdAt: string, today: ISODate): number {
  let last = createdAt;
  for (const e of entries) if (e.createdAt > last) last = e.createdAt;
  const d = new Date(last);
  if (Number.isNaN(d.getTime())) return 0;
  return Math.max(0, differenceInCalendarDays(fromISO(today), fromISO(toISO(d))));
}

export type BillTodo = Extract<Todo, { kind: 'bill' }>;

/**
 * Lejárt vagy `withinDays` napon belül esedékes, még le nem zárt fix számlák az időszakban (terv és esedékességi
 * nap nélküliek nem), esedékesség szerint. A teendők és a gyorsrögzítő számla-chipjei is ezt használják.
 */
export function dueBills(categories: Category[], p: PeriodSummary, today: ISODate, withinDays = DUE_SOON_DAYS): BillTodo[] {
  const bills: BillTodo[] = [];
  for (const c of categories) {
    const f = p.byCategory.get(c.id);
    if (c.archived || c.type !== 'fix' || !c.dueDay || !f || f.plan <= 0) continue;
    const st = fixStatus(f.plan, f.actual, f.settled);
    if (st !== 'unpaid' && st !== 'partial') continue;
    const due = dueDateInPeriod(c.dueDay, p.start, p.end);
    if (!due) continue;
    const overdue = due < today;
    if (!overdue && differenceInCalendarDays(fromISO(due), fromISO(today)) > withinDays) continue;
    bills.push({ kind: 'bill', cat: c, amount: f.plan - f.actual, partial: st === 'partial', due, overdue });
  }
  return bills.sort((a, b) => a.due.localeCompare(b.due) || a.cat.order - b.cat.order);
}

/**
 * Az Áttekintés teendői fontossági sorrendben: esedékes számlák (a lejártak elöl), késő bevétel, túlfutó
 * keretek (legfeljebb 2), lemaradó célok, régóta nincs rögzítés, elavult mentés. A felület ebből legfeljebb
 * MAX_TODOS elemet mutat.
 */
export function buildTodos(input: TodoInput): Todo[] {
  const { period: p, today, pace } = input;
  const active = input.categories.filter((c) => !c.archived);
  const fig = (c: Category) => p.byCategory.get(c.id);
  const out: Todo[] = [];

  out.push(...dueBills(input.categories, p, today));

  if (pace.days.elapsed > INCOME_GRACE_DAYS) {
    for (const c of active) {
      const f = fig(c);
      if (c.type !== 'bevetel' || recordStyle(c) !== 'fix' || !f || f.plan <= 0) continue;
      const st = fixStatus(f.plan, f.actual, f.settled);
      if (st === 'unpaid' || st === 'partial') out.push({ kind: 'income', cat: c, amount: f.plan - f.actual, partial: st === 'partial' });
    }
  }

  // Ugyanabban a sorrendben, mint a hero állapotmondata: előbb a túlfutó, utána a terv nélkül költött keretek.
  const envs = [...pace.flagged.filter((e) => !e.cat.archived), ...pace.unplanned];
  for (const env of envs.slice(0, MAX_ENVELOPES)) out.push({ kind: 'envelope', env });

  for (const { cat, g } of input.goals) if (g.state === 'behind') out.push({ kind: 'goal', cat, goal: g });

  const idle = daysSinceLastEntry(input.entries, input.createdAt, today);
  if (idle > IDLE_DAYS) out.push({ kind: 'idle', days: idle });

  if (input.backup.stale) out.push({ kind: 'backup', days: input.backup.days });
  return out;
}

const roundTo100 = (n: number) => Math.round(n / 100) * 100;

/** A teendő egysoros szövege. */
export function todoText(t: Todo, today: ISODate): string {
  switch (t.kind) {
    case 'bill': {
      const when = t.overdue ? `lejárt ${shortDate(t.due)}` : t.due === today ? 'ma esedékes' : `esedékes ${shortDate(t.due)}`;
      return `${t.cat.name} · ${when} · ${t.partial ? `hátra ${formatFt(t.amount)}` : formatFt(t.amount)}`;
    }
    case 'income':
      return t.partial
        ? `${t.cat.name}: még ${formatFt(t.amount)} nem érkezett meg`
        : `${t.cat.name} még nem érkezett meg · ${formatFt(t.amount)}`;
    case 'envelope': {
      const e = t.env;
      if (e.pace === 'over') return `${e.cat.name}: ${formatFt(e.actual - e.plan)}-tal túllépve`;
      if (e.pace === 'ok') return `${e.cat.name}: terv nélkül ${formatFt(e.actual)}`;
      // Az időszak első napjaiban nincs vetítés (projected = tény): az eddig elfogyott arány látszik.
      return e.projected > e.plan
        ? `${e.cat.name}: gyorsabban fogy a tervezettnél · ~${formatFt(roundTo100(e.projected - e.plan))} túllépés várható`
        : `${e.cat.name}: gyorsabban fogy a tervezettnél · eddig a terv ${usedPct(e)}%-a`;
    }
    case 'goal':
      return t.goal.requiredMonthly !== null
        ? `${t.cat.name}: lemarad a céltól · havi ${formatFt(t.goal.requiredMonthly)} kellene`
        : `${t.cat.name}: a határidőig nem gyűlik össze`;
    case 'idle':
      return `${t.days} napja nem rögzítettél semmit`;
    case 'backup':
      return t.days === null ? 'Még nem mentetted le az adatokat' : `${t.days} napja nem mentetted le az adatokat`;
  }
}
