import { addDays, differenceInCalendarDays } from 'date-fns';
import { formatFt } from './money';
import { fromISO, shiftPeriod, shortDate, toISO } from './periods';
import type { Category, Entry, ISODate, PeriodId } from './types';

/** Gyorsgombok, ha a kategóriának még nincs rögzítése az utolsó időszakokban. */
export const DEFAULT_QUICK_AMOUNTS = [5000, 10000, 20000];
/** Ennyi időszak (a vizsgált és az azt megelőzők) rögzítéseiből jönnek a javasolt összegek. */
export const SUGGEST_PERIODS = 3;
/** A leggyakoribb összegek száma; mellé jön még a legutóbbi, ha nincs köztük. */
const SUGGEST_TOP = 3;
/** A gyorsrögzítő keretei ennyi nap használati gyakorisága szerint rendeződnek. */
export const USAGE_DAYS = 60;
/** Az új időszak ennyiedik napjáig lehet a gyorsrögzítőben még az előző időszakba is rögzíteni. */
export const PREVIOUS_PERIOD_DAYS = 3;

const roundTo100 = (n: number) => Math.round(n / 100) * 100;

/**
 * Javasolt gyorsgomb-összegek egy kategóriához: az utolsó 3 időszak rögzítéseiből a 3 leggyakoribb, 100 Ft-ra
 * kerekített összeg, és a legutóbbi, ha nincs köztük. Egyenlő gyakoriságnál a frissebb nyer. Növekvő sorrendben;
 * ha nincs adat, a +5e/+10e/+20e. A „Havi összeg megadása” egész hónapos összege nem számít: az nem egy vásárlás.
 */
export function suggestedAmounts(entries: Entry[], categoryId: string, periodId: PeriodId): number[] {
  const from = shiftPeriod(periodId, -(SUGGEST_PERIODS - 1));
  const stats = new Map<number, { n: number; last: string }>();
  let latest: { amount: number; at: string } | null = null;
  for (const e of entries) {
    if (e.categoryId !== categoryId || e.kind === 'withdrawal' || e.monthlyTotal) continue;
    if (e.periodId < from || e.periodId > periodId) continue;
    const amount = roundTo100(e.amount);
    if (amount <= 0) continue;
    const s = stats.get(amount);
    if (s) {
      s.n++;
      if (e.createdAt > s.last) s.last = e.createdAt;
    } else stats.set(amount, { n: 1, last: e.createdAt });
    if (!latest || e.createdAt > latest.at) latest = { amount, at: e.createdAt };
  }
  if (!latest) return DEFAULT_QUICK_AMOUNTS;
  const top = [...stats]
    .sort(([a, x], [b, y]) => y.n - x.n || y.last.localeCompare(x.last) || a - b)
    .slice(0, SUGGEST_TOP)
    .map(([amount]) => amount);
  if (!top.includes(latest.amount)) top.push(latest.amount);
  return top.sort((a, b) => a - b);
}

/** Kategóriánként a rögzítések száma az utolsó `days` napban, a mai nappal együtt (a felhasználások nélkül). */
export function usageCounts(entries: Entry[], today: ISODate, days = USAGE_DAYS): Map<string, number> {
  const from = toISO(addDays(fromISO(today), -(days - 1)));
  const out = new Map<string, number>();
  for (const e of entries) {
    if (e.kind === 'withdrawal' || e.date < from || e.date > today) continue;
    out.set(e.categoryId, (out.get(e.categoryId) ?? 0) + 1);
  }
  return out;
}

/** A gyorsrögzítő keretei: az aktívak, a 60 napos használat szerint csökkenő, azon belül a megszokott sorrendben. */
export function quickEnvelopes(categories: Category[], entries: Entry[], today: ISODate): Category[] {
  const usage = usageCounts(entries, today);
  return categories
    .filter((c) => c.type === 'keret' && !c.archived)
    .sort((a, b) => (usage.get(b.id) ?? 0) - (usage.get(a.id) ?? 0) || a.order - b.order);
}

/**
 * Az új időszak első napjaiban (a kezdőnappal együtt 3 napig) a gyorsrögzítő az előző időszakot is felkínálja,
 * mert a fizetésnap előtti költés gyakran csak utána kerül rögzítésre.
 */
export function offersPreviousPeriod(start: ISODate, today: ISODate): boolean {
  const n = differenceInCalendarDays(fromISO(today), fromISO(start));
  return n >= 0 && n < PREVIOUS_PERIOD_DAYS;
}

/** Az esedékes számla chipje: „Áram · 18 000 Ft” (részben fizetettnél a hátralék). */
export function billChipText(name: string, amount: number): string {
  return `${name} · ${formatFt(amount)}`;
}

/** A legutóbbi rögzítések (minden kategóriából és időszakból), a rögzítés ideje szerint csökkenő sorrendben. */
export function recentEntries(entries: Entry[], limit = 10): Entry[] {
  return [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)).slice(0, limit);
}

/** A rögzítés ideje helyi idő szerint: „ma 18:42”, „tegnap 9:05”, „okt. 6. 18:42”. */
export function recordedAtText(createdAt: string, today: ISODate): string {
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return '';
  const time = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  const day = toISO(d);
  const ago = differenceInCalendarDays(fromISO(today), fromISO(day));
  if (ago === 0) return `ma ${time}`;
  if (ago === 1) return `tegnap ${time}`;
  return `${shortDate(day)} ${time}`;
}
