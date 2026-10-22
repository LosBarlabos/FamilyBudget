import { addMonths, getDaysInMonth } from 'date-fns';
import { formatFt } from './money';
import { fromISO, toISO } from './periods';
import type { Category, CategoryType, ISODate } from './types';

export type FixStatus = 'unpaid' | 'partial' | 'paid' | 'paidDiff';

/** A lezárt (settles) tétel akkor is kész, ha a tény a tervnél kisebb, akár 0 („Nem volt”). */
export function fixStatus(plan: number, actual: number, settled = false): FixStatus {
  if (settled) return actual === plan ? 'paid' : 'paidDiff';
  if (actual <= 0) return 'unpaid';
  if (actual < plan) return 'partial';
  return actual === plan ? 'paid' : 'paidDiff';
}

/** Az esedékesség dátuma az időszakon belül; rövidebb hónapban a hónap utolsó napja. */
export function dueDateInPeriod(dueDay: number, start: ISODate, end: ISODate): ISODate | null {
  let month = fromISO(start.slice(0, 8) + '01');
  const last = fromISO(end);
  while (month <= last) {
    const day = Math.min(dueDay, getDaysInMonth(month));
    const d = toISO(new Date(month.getFullYear(), month.getMonth(), day));
    if (d >= start && d <= end) return d;
    month = addMonths(month, 1);
  }
  return null;
}

export function isOverdue(due: ISODate | null, today: ISODate, status: FixStatus): boolean {
  return due !== null && due < today && (status === 'unpaid' || status === 'partial');
}

/** A fix tétel egy kattintásos lezárásának szava a kategória típusa szerint. */
export const PAID_WORD: Record<CategoryType, string> = {
  bevetel: 'Megérkezett',
  megtakaritas: 'Félretéve',
  fix: 'Kifizetve',
  keret: 'Kifizetve',
};

/** Az egy kattintásos lezárás gombja: nyitott tételnél „Kifizetve” / „Megérkezett” / „Félretéve”, részlegesnél „Maradék”. */
export function settleLabel(type: CategoryType, partial: boolean): string {
  return partial ? 'Maradék' : PAID_WORD[type];
}

/** Az egy kattintásos lezárás üzenete, pl. „Áram: kifizetve 18 000 Ft”. */
export function settleMessage(cat: Pick<Category, 'name' | 'type'>, amount: number, partial: boolean): string {
  return `${cat.name}: ${settleLabel(cat.type, partial).toLowerCase()} ${formatFt(amount)}`;
}

/** A sáv kitöltése százalékban, 0 és 100 közé szorítva (negatív összegnél üres, túllépésnél tele). */
export function barPercent(value: number, max: number): number {
  if (!(value > 0)) return 0;
  if (!(max > 0)) return 100;
  return Math.min(100, (value / max) * 100);
}
