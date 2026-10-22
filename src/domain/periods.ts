import { addDays, addMonths, getDaysInMonth } from 'date-fns';
import type { ISODate, PeriodId, PeriodOverride } from './types';

export const MONTHS = [
  'Január', 'Február', 'Március', 'Április', 'Május', 'Június',
  'Július', 'Augusztus', 'Szeptember', 'Október', 'November', 'December',
];
/** Az időszak kezdetétől való érvényesség: 'októbertől', 'januártól'. */
const MONTHS_FROM = [
  'januártól', 'februártól', 'márciustól', 'áprilistól', 'májustól', 'júniustól',
  'júliustól', 'augusztustól', 'szeptembertől', 'októbertől', 'novembertől', 'decembertől',
];
/** Az időszakra szóló érvényesség: 'októberre', 'januárra'. */
const MONTHS_FOR = [
  'januárra', 'februárra', 'márciusra', 'áprilisra', 'májusra', 'júniusra',
  'júliusra', 'augusztusra', 'szeptemberre', 'októberre', 'novemberre', 'decemberre',
];
export const MONTHS_SHORT = ['Jan', 'Feb', 'Már', 'Ápr', 'Máj', 'Jún', 'Júl', 'Aug', 'Szep', 'Okt', 'Nov', 'Dec'];

export type PeriodStatus = 'closed' | 'current' | 'future';

export interface PeriodConfig {
  payday: number;
  overrides: Record<PeriodId, ISODate>;
}

export function toISO(d: Date): ISODate {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function fromISO(s: ISODate): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayISO(): ISODate {
  return toISO(new Date());
}

export function periodIdOf(year: number, month0: number): PeriodId {
  return `${year}-${String(month0 + 1).padStart(2, '0')}`;
}

export function parsePeriodId(id: PeriodId): { year: number; month0: number } {
  const [y, m] = id.split('-').map(Number);
  return { year: y, month0: m - 1 };
}

export function shiftPeriod(id: PeriodId, n: number): PeriodId {
  const { year, month0 } = parsePeriodId(id);
  const d = addMonths(new Date(year, month0, 1), n);
  return periodIdOf(d.getFullYear(), d.getMonth());
}

/** Hány időszak (hónap) van from-tól to-ig; negatív, ha to a korábbi. */
export function periodDistance(from: PeriodId, to: PeriodId): number {
  const a = parsePeriodId(from);
  const b = parsePeriodId(to);
  return (b.year - a.year) * 12 + (b.month0 - a.month0);
}

/** Biztonsági felső korlát: 100 év. Sérült azonosítónál ('NaN-NaN') a szöveges összevetés sosem állna le. */
export const MAX_PERIOD_RANGE = 1200;

export const PERIOD_ID_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Inkluzív lista from-tól to-ig; üres, ha from > to vagy valamelyik azonosító érvénytelen. */
export function periodRange(from: PeriodId, to: PeriodId): PeriodId[] {
  const out: PeriodId[] = [];
  if (!PERIOD_ID_RE.test(from) || !PERIOD_ID_RE.test(to)) return out;
  for (let p = from; p <= to && out.length < MAX_PERIOD_RANGE; p = shiftPeriod(p, 1)) out.push(p);
  return out;
}

export function makeConfig(payday: number, overrides: PeriodOverride[]): PeriodConfig {
  return { payday, overrides: Object.fromEntries(overrides.map((o) => [o.periodId, o.startDate])) };
}

export function defaultStart(id: PeriodId, payday: number): ISODate {
  const { year, month0 } = parsePeriodId(id);
  const day = Math.min(payday, getDaysInMonth(new Date(year, month0, 1)));
  return toISO(new Date(year, month0, day));
}

export function periodStart(id: PeriodId, cfg: PeriodConfig): ISODate {
  return cfg.overrides[id] ?? defaultStart(id, cfg.payday);
}

export function periodEnd(id: PeriodId, cfg: PeriodConfig): ISODate {
  return toISO(addDays(fromISO(periodStart(shiftPeriod(id, 1), cfg)), -1));
}

export function periodForDate(date: ISODate, cfg: PeriodConfig): PeriodId {
  const base = date.slice(0, 7);
  for (const n of [0, -1, 1, -2]) {
    const id = shiftPeriod(base, n);
    if (periodStart(id, cfg) <= date && date <= periodEnd(id, cfg)) return id;
  }
  return base;
}

export function periodStatus(id: PeriodId, currentId: PeriodId): PeriodStatus {
  if (id < currentId) return 'closed';
  if (id > currentId) return 'future';
  return 'current';
}

export function periodName(id: PeriodId, withYear = false): string {
  const { year, month0 } = parsePeriodId(id);
  return withYear ? `${year}. ${MONTHS[month0].toLowerCase()}` : MONTHS[month0];
}

/** 'októbertől' – toastokhoz, pl. „Élelmiszer: 95 000 Ft októbertől”. */
export function periodFromName(id: PeriodId): string {
  return MONTHS_FROM[parsePeriodId(id).month0];
}

/** 'októberre' – „csak erre a hónapra” toastokhoz. */
export function periodForName(id: PeriodId): string {
  return MONTHS_FOR[parsePeriodId(id).month0];
}

/** 'decemberi', más évben '2027. januári' (a refId évéhez képest). */
export function periodAdjective(id: PeriodId, refId: PeriodId): string {
  const { year, month0 } = parsePeriodId(id);
  const adj = `${MONTHS[month0].toLowerCase()}i`;
  return year === parsePeriodId(refId).year ? adj : `${year}. ${adj}`;
}

/** 'dec.', más évben '2027. jan.' (a refId évéhez képest). */
export function periodShortLabel(id: PeriodId, refId: PeriodId): string {
  const { year, month0 } = parsePeriodId(id);
  return year === parsePeriodId(refId).year ? `${MONTHS_SHORT[month0].toLowerCase()}.` : periodShortWithYear(id);
}

/** 'okt. 10.' */
export function shortDate(d: ISODate): string {
  const x = fromISO(d);
  return `${MONTHS_SHORT[x.getMonth()].toLowerCase()}. ${x.getDate()}.`;
}

/** Ennyi ezredmásodperc van hátra a következő nap kezdetéig (helyi idő szerint). */
export function msUntilNextDay(now: Date): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return next.getTime() - now.getTime();
}

export interface StartChoice {
  currentId: PeriodId;
  nextId: PeriodId;
  nextStart: ISODate;
  /** A mostani időszakból a mai nap előtt eltelt napok aránya (0–1). */
  elapsed: number;
  /** Ha a mostani időszak több mint fele eltelt, a következő fizetéssel érdemes kezdeni. */
  suggestNext: boolean;
}

/** Első indításkor: a mostani vagy a következő időszakkal kezdődjön a költségvetés. */
export function startChoice(today: ISODate, cfg: PeriodConfig): StartChoice {
  const currentId = periodForDate(today, cfg);
  const nextId = shiftPeriod(currentId, 1);
  const start = fromISO(periodStart(currentId, cfg));
  const nextStart = periodStart(nextId, cfg);
  const total = Math.round((fromISO(nextStart).getTime() - start.getTime()) / 86_400_000);
  const passed = Math.round((fromISO(today).getTime() - start.getTime()) / 86_400_000);
  const elapsed = total > 0 ? passed / total : 0;
  return { currentId, nextId, nextStart, elapsed, suggestNext: elapsed > 0.5 };
}

/** '2027. jún.' */
export function periodShortWithYear(id: PeriodId): string {
  const { year, month0 } = parsePeriodId(id);
  return `${year}. ${MONTHS_SHORT[month0].toLowerCase()}.`;
}

export function periodShortName(id: PeriodId): string {
  return MONTHS_SHORT[parsePeriodId(id).month0];
}

/** '10.10.–11.09.' */
export function formatRange(start: ISODate, end: ISODate): string {
  const f = (s: ISODate) => `${s.slice(5, 7)}.${s.slice(8, 10)}.`;
  return `${f(start)}–${f(end)}`;
}

/**
 * Egy időszak kezdőnapjának felülírása csak úgy érvényes, ha az előző időszak kezdete után
 * és a következő időszak kezdete előtt van, különben két időszak összecsúszna.
 */
export function validateOverride(id: PeriodId, start: ISODate, cfg: PeriodConfig): string | null {
  const prevStart = periodStart(shiftPeriod(id, -1), cfg);
  const nextStart = periodStart(shiftPeriod(id, 1), cfg);
  if (start <= prevStart) return 'A kezdőnap nem lehet az előző időszak kezdete előtt.';
  if (start >= nextStart) return 'A kezdőnap nem lehet a következő időszak kezdete után.';
  return null;
}

/**
 * Az új fizetésnap mellett már érvénytelen kezdőnap-felülírások. Egy felülírás törlése a szomszédjait is
 * érintheti, ezért addig szűr, amíg a megmaradók mind érvényesek.
 */
export function invalidOverrides(overrides: PeriodOverride[], payday: number): PeriodOverride[] {
  let kept = overrides;
  for (;;) {
    const bad = kept.filter((o) => validateOverride(o.periodId, o.startDate, makeConfig(payday, kept.filter((k) => k !== o))) !== null);
    if (bad.length === 0) break;
    kept = kept.filter((o) => !bad.includes(o));
  }
  return overrides.filter((o) => !kept.includes(o));
}

/** A mai nap az időszakon belül, különben az időszak hozzá legközelebbi napja. */
export function clampToPeriod(date: ISODate, id: PeriodId, cfg: PeriodConfig): ISODate {
  const s = periodStart(id, cfg);
  const e = periodEnd(id, cfg);
  return date < s ? s : date > e ? e : date;
}
