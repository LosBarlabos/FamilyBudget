import { addDays } from 'date-fns';
import type { PeriodSummary, Summaries } from './balance';
import { formatFt, formatSigned } from './money';
import { untilDate, type PaceOverview, type PeriodDays } from './pace';
import { fromISO, MONTHS, parsePeriodId, toISO } from './periods';
import type { ISODate } from './types';

/** A hónapcsík egy napja: eltelt, a mai, a költés által „előre elhasznált”, vagy még előttünk álló. */
export interface StripDay {
  date: ISODate;
  weekend: boolean;
  state: 'past' | 'today' | 'ahead' | 'future';
}

export interface MonthStrip {
  days: StripDay[];
  /** Ennyi nappal jár előrébb a költés az időnél; negatív, ha mögötte jár. */
  ahead: number;
  /** A napi összegbe számító keretekből elfogyott rész és az eltelt idő, egész százalékban. */
  spentPct: number;
  elapsedPct: number;
}

/**
 * A Csekk hónapcsíkja: a hónap minden napja egy oszlop. A keretekből elfogyott arányt napokra váltja (a hónap
 * hányadik napjáig „tartana” ez a költés lineárisan), és ami ebből a mai nap utánra esik, az előreszaladt rész.
 */
export function monthStrip(p: Pick<PeriodSummary, 'start'>, pace: Pick<PaceOverview, 'days' | 'allowance'>): MonthStrip {
  const { days, allowance } = pace;
  const spentRatio = allowance.plan > 0 ? Math.max(0, (allowance.plan - allowance.left) / allowance.plan) : 0;
  const spentDays = Math.min(days.total, Math.round(spentRatio * days.total));
  const start = fromISO(p.start);
  const list: StripDay[] = Array.from({ length: days.total }, (_, i) => {
    const d = addDays(start, i);
    const n = i + 1;
    const state = n < days.elapsed ? 'past' : n === days.elapsed ? 'today' : n <= spentDays ? 'ahead' : 'future';
    return { date: toISO(d), weekend: d.getDay() === 0 || d.getDay() === 6, state };
  });
  return {
    days: list,
    ahead: spentDays - days.elapsed,
    spentPct: Math.round(spentRatio * 100),
    elapsedPct: Math.round(days.ratio * 100),
  };
}

/** A csík alatti mondat: kiemelt rész („3 nappal előrébb jársz.”) és a számok, a tónussal. */
export function stripSentence(s: MonthStrip): { strong: string; rest: string; tone: 'ok' | 'warn' } {
  const rest = `A keretek ${s.spentPct}%-a fogyott el, a hónap ${s.elapsedPct}%-a telt el.`;
  if (s.ahead >= 1) return { strong: `${s.ahead} nappal előrébb jársz.`, rest, tone: 'warn' };
  if (s.ahead <= -1) return { strong: `${-s.ahead} nap tartalékod van.`, rest, tone: 'ok' };
  return { strong: 'Épp a terv szerint haladsz.', rest, tone: 'ok' };
}

/** A csík képernyőolvasós leírása egy mondatban. */
export function stripDescription(s: MonthStrip, days: PeriodDays): string {
  const lead = `A hónap ${days.total} napjából ${days.elapsed} telt el, a keretek ${s.spentPct} százaléka elfogyott`;
  if (s.ahead >= 1) return `${lead}: a költés ${s.ahead} nappal előrébb jár.`;
  if (s.ahead <= -1) return `${lead}: a költés ${-s.ahead} nappal az idő mögött jár.`;
  return `${lead}: a költés az idővel együtt halad.`;
}

/** „még 14 napig (nov. 5-ig)”, a dátum nem törik el; az utolsó napon „ma van a hónap utolsó napja”. */
export function remainingText(days: PeriodDays, end: ISODate): string {
  return days.remaining <= 1 ? 'ma van a hónap utolsó napja' : `még ${days.remaining} napig (${untilDate(end).replace(' ', '\u00a0').replace('-', '-\u2060')})`;
}

/** 'Októberben', 'Januárban' – a hónap neve -ban/-ben raggal. */
export function inMonth(id: string): string {
  const name = MONTHS[parsePeriodId(id).month0];
  return /[ée]r$/.test(name) ? `${name}ben` : `${name}ban`;
}

export interface NegativeOutlook {
  /** Az első hónap (a folyamatban lévőtől előre), amelynek a végére mínuszba fordul a futó egyenleg. */
  first: PeriodSummary;
  /** A mélypont: a legalacsonyabb hónap végi egyenleg a folyamatban lévő hónaptól előre. */
  low: PeriodSummary;
}

/** Null, ha a futó egyenleg a folyamatban lévő és az előre tervezett hónapokban sehol sem megy nulla alá. */
export function negativeOutlook(s: Pick<Summaries, 'periods'>): NegativeOutlook | null {
  const ahead = s.periods.filter((p) => p.status !== 'closed');
  const first = ahead.find((p) => p.endBalance < 0);
  if (!first) return null;
  const low = ahead.reduce((m, p) => (p.endBalance < m.endBalance ? p : m));
  return { first, low };
}

/** A figyelmeztetés címe és alsora, pl. „Januárban mínuszba fordul a futó egyenleg.” */
export function negativeOutlookText(o: NegativeOutlook): { title: string; sub: string } {
  const title =
    o.first.status === 'current'
      ? 'A hónap végére mínuszba fordul a futó egyenleg.'
      : `${inMonth(o.first.id)} mínuszba fordul a futó egyenleg.`;
  const when = o.low.id === o.first.id ? '' : `, ${inMonth(o.low.id).toLowerCase()}`;
  return { title, sub: `A mélypont ${formatSigned(o.low.endBalance)}${when}. A Tervezőben látszik, melyik hónap okozza.` };
}

/** A hero alsora a napi összeggel: „Naponta kb. 8 000 Ft jut, még 14 napig (nov. 5-ig).” */
export function allowanceLine(perDay: number | null, days: PeriodDays, end: ISODate): { lead: string; amount: string; tail: string } | null {
  if (perDay === null || days.remaining <= 1) return null;
  return { lead: 'Naponta kb. ', amount: formatFt(perDay), tail: ` jut, ${remainingText(days, end)}.` };
}
