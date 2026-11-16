import { tagsOf } from './analysis';
import { formatFt } from './money';
import { article } from './pace';
import { periodAdjective, periodForDate, shortDate, type PeriodConfig } from './periods';
import { isExpense, recordStyle, type Category, type CategoryType, type Entry, type ISODate, type PeriodId } from './types';

/**
 * A rögzítések listája (Elemzés → Rögzítések) és egy rögzítés szerkesztésének szabályai.
 *
 * A szerkesztés helyben módosítja a rögzítést (az azonosítója marad), így a közös használat szinkronja egyszerű
 * módosításként viszi át. A hónap (időszak) a dátumot követi: ha a nap másik hónapba kerül, a rögzítés is.
 */

// --- Lista: szűrés, összegzés, csoportosítás ---------------------------------

export interface EntryFilter {
  /** Csak ennek a hónapnak a rögzítései; null: mind. */
  periodId: PeriodId | null;
  /** „c:<kategóriaId>” egy kategória, „t:<típus>” egy típus minden kategóriája; null: mind. */
  scope: string | null;
  /** Keresés a megjegyzésben, a kategória és a rögzítő nevében; „#címke” pontos címkére. */
  query: string;
}

export const NO_FILTER: EntryFilter = { periodId: null, scope: null, query: '' };

/** A legújabbtól: a rögzítés napja, azon belül a rögzítés ideje szerint. */
const newestFirst = (a: Entry, b: Entry) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id);

/**
 * A szűrőnek megfelelő rögzítések a legújabbtól. A megtakarításból fizetett költés annál a kategóriánál (és
 * típusnál) is megjelenik, amelyre költötték, ahogy az Elemzés többi része is oda számolja.
 */
export function filterEntries(entries: Entry[], categories: Category[], f: EntryFilter): Entry[] {
  const cats = new Map(categories.map((c) => [c.id, c]));
  const q = f.query.trim().toLocaleLowerCase('hu');
  const tag = q.startsWith('#') ? q.slice(1) : null;
  const catId = f.scope?.startsWith('c:') ? f.scope.slice(2) : null;
  const type = f.scope?.startsWith('t:') ? (f.scope.slice(2) as CategoryType) : null;
  const spendCat = (e: Entry) => (e.kind === 'withdrawal' && e.spendCategoryId ? cats.get(e.spendCategoryId) : undefined);
  const hit = (e: Entry) => {
    if (f.periodId !== null && e.periodId !== f.periodId) return false;
    if (catId !== null && e.categoryId !== catId && spendCat(e)?.id !== catId) return false;
    if (type !== null && cats.get(e.categoryId)?.type !== type && spendCat(e)?.type !== type) return false;
    if (!q) return true;
    if (tag !== null) return tagsOf(e.note).includes(tag);
    return (
      (e.note ?? '').toLocaleLowerCase('hu').includes(q) ||
      (cats.get(e.categoryId)?.name ?? '').toLocaleLowerCase('hu').includes(q) ||
      (spendCat(e)?.name ?? '').toLocaleLowerCase('hu').includes(q) ||
      (e.createdBy ?? '').toLocaleLowerCase('hu').includes(q)
    );
  };
  return entries.filter(hit).sort(newestFirst);
}

export interface EntryTotals {
  count: number;
  /** Számlák és keretek a havi pénzből. */
  expense: number;
  income: number;
  /** Megtakarításba félretéve. */
  saved: number;
  /** Megtakarításból felhasználva. */
  fromSavings: number;
}

export function entryTotals(list: Entry[], categories: Category[]): EntryTotals {
  const cats = new Map(categories.map((c) => [c.id, c]));
  const t: EntryTotals = { count: list.length, expense: 0, income: 0, saved: 0, fromSavings: 0 };
  for (const e of list) {
    const type = cats.get(e.categoryId)?.type;
    if (e.kind === 'withdrawal') t.fromSavings += e.amount;
    else if (type === 'bevetel') t.income += e.amount;
    else if (type === 'megtakaritas') t.saved += e.amount;
    else if (type) t.expense += e.amount;
  }
  return t;
}

/** „128 rögzítés · kiadás 1 284 300 Ft · bevétel 1 040 000 Ft”; csak a nem nulla részek. */
export function totalsText(t: EntryTotals): string {
  const parts = [`${t.count} rögzítés`];
  if (t.expense) parts.push(`kiadás ${formatFt(t.expense)}`);
  if (t.income) parts.push(`bevétel ${formatFt(t.income)}`);
  if (t.saved) parts.push(`félretéve ${formatFt(t.saved)}`);
  if (t.fromSavings) parts.push(`megtakarításból ${formatFt(t.fromSavings)}`);
  return parts.join(' · ');
}

/** A (már rendezett) lista naponként csoportosítva. */
export function groupByDay(list: Entry[]): { date: ISODate; entries: Entry[] }[] {
  const out: { date: ISODate; entries: Entry[] }[] = [];
  for (const e of list) {
    const last = out.at(-1);
    if (last && last.date === e.date) last.entries.push(e);
    else out.push({ date: e.date, entries: [e] });
  }
  return out;
}

// --- Szerkesztés -------------------------------------------------------------

export interface EditScope {
  date: boolean;
  category: boolean;
  /** A megtakarításból fizetett költés „Mire ment?” kategóriája. */
  spend: boolean;
}

/**
 * Mit lehet a rögzítésen az összegen és a megjegyzésen túl módosítani. A havi összeg egy egész hónapot fed le,
 * ezért a napja és a kategóriája kötött; a megtakarítás (befizetés és felhasználás) a céljához tartozik.
 */
export function editScope(e: Entry, cat: Category | undefined): EditScope {
  if (e.monthlyTotal || !cat) return { date: !e.monthlyTotal, category: false, spend: false };
  if (e.kind === 'withdrawal') return { date: true, category: false, spend: true };
  return { date: true, category: cat.type !== 'megtakaritas', spend: false };
}

const byOrder = (a: Category, b: Category) => a.order - b.order || a.name.localeCompare(b.name, 'hu');

/**
 * A választható kategóriák: kiadás csak kiadási kategóriába (keret vagy számla), bevétel csak bevételbe, hogy a
 * módosítás ne fordítsa át a tétel előjelét. Az archivált kimarad, kivéve a rögzítés mostani kategóriáját.
 */
export function categoryChoices(e: Entry, categories: Category[]): Category[] {
  const cur = categories.find((c) => c.id === e.categoryId);
  if (!cur) return [];
  if (!editScope(e, cur).category) return [cur];
  const fits = (c: Category) => (isExpense(cur) ? isExpense(c) : c.type === cur.type);
  return categories.filter((c) => c.id === cur.id || (!c.archived && fits(c))).sort(byOrder);
}

/** A „Mire ment?” választható kategóriái a megtakarításból fizetett költésnél. */
export function spendChoices(e: Entry, categories: Category[]): Category[] {
  return categories.filter((c) => isExpense(c) && (!c.archived || c.id === e.spendCategoryId)).sort(byOrder);
}

export interface EntryDraft {
  /** null: üres vagy érvénytelen bevitel. */
  amount: number | null;
  date: ISODate;
  categoryId: string;
  note: string;
  /** Üres: nincs megadva. */
  spendCategoryId: string;
}

export function draftOf(e: Entry): EntryDraft {
  return { amount: e.amount, date: e.date, categoryId: e.categoryId, note: e.note ?? '', spendCategoryId: e.spendCategoryId ?? '' };
}

export interface EditLimits {
  minDate: ISODate;
  maxDate: ISODate;
  /** Megtakarításból fizetett tételnél legfeljebb ennyi lehet (a cél egyenlege e nélkül a tétel nélkül); egyébként null. */
  maxAmount: number | null;
}

/**
 * A dátum a költségvetés első napjától máig állítható (a jövőbe előre rögzített tétel a saját napjáig), mert
 * a kezdet előtti nap egyik hónapba sem számítana bele.
 */
export function editLimits(e: Entry, firstDay: ISODate, today: ISODate, saved: number | null): EditLimits {
  return {
    minDate: e.date < firstDay ? e.date : firstDay,
    maxDate: e.date > today ? e.date : today,
    maxAmount: e.kind === 'withdrawal' && saved !== null ? saved + e.amount : null,
  };
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type EditErrors = Partial<Record<'amount' | 'date', string>>;

export function editErrors(e: Entry, d: EntryDraft, limits: EditLimits): EditErrors {
  const out: EditErrors = {};
  // 0 Ft-os rögzítés csak lezárásként értelmes („Nem volt”).
  if (d.amount === null || !Number.isInteger(d.amount) || d.amount < 0 || (d.amount === 0 && !e.settles)) out.amount = 'Adj meg egy érvényes összeget';
  else if (limits.maxAmount !== null && d.amount > limits.maxAmount) out.amount = `Ezen a megtakarításon csak ${formatFt(limits.maxAmount)} van`;
  if (!e.monthlyTotal) {
    if (!ISO_DATE_RE.test(d.date)) out.date = 'Adj meg egy napot';
    else if (d.date > limits.maxDate) out.date = 'Jövőbeli nap nem adható meg';
    else if (d.date < limits.minDate) out.date = `A költségvetés kezdete (${shortDate(limits.minDate)}) előtti nap nem adható meg`;
  }
  return out;
}

/**
 * A módosított rögzítés. A hónap csak akkor változik, ha a dátum is; a lezárás jelzője csak fix tételnél marad
 * meg (keretnél nincs lezárás).
 */
export function applyEdit(e: Entry, d: EntryDraft & { amount: number }, categories: Category[], cfg: PeriodConfig): Entry {
  const scope = editScope(e, categories.find((c) => c.id === e.categoryId));
  const categoryId = scope.category && categoryChoices(e, categories).some((c) => c.id === d.categoryId) ? d.categoryId : e.categoryId;
  const target = categories.find((c) => c.id === categoryId);
  const date = scope.date ? d.date : e.date;
  const next: Entry = {
    ...e,
    amount: d.amount,
    date,
    periodId: date === e.date ? e.periodId : periodForDate(date, cfg),
    categoryId,
    note: d.note.trim() || undefined,
  };
  if (e.settles && !(target && recordStyle(target) === 'fix')) next.settles = undefined;
  if (scope.spend) next.spendCategoryId = d.spendCategoryId || undefined;
  return next;
}

/** Változott-e bármi a szerkeszthető mezők közül. */
export function entryChanged(a: Entry, b: Entry): boolean {
  return (
    a.amount !== b.amount || a.date !== b.date || a.periodId !== b.periodId || a.categoryId !== b.categoryId ||
    (a.note ?? '') !== (b.note ?? '') || (a.spendCategoryId ?? '') !== (b.spendCategoryId ?? '') || !!a.settles !== !!b.settles
  );
}

/** A mentés előtt látható megjegyzések: a rögzítés másik hónapba kerül, illetve lezárt hónapot érint. */
export function editNotes(e: Entry, next: Entry, currentId: PeriodId): string[] {
  const out: string[] = [];
  if (next.periodId !== e.periodId) {
    const adj = periodAdjective(next.periodId, currentId);
    out.push(`${article(adj)} ${adj} hónapba kerül át.`);
  }
  if (e.periodId < currentId || next.periodId < currentId) out.push('Lezárt hónapot érint: a hónap összege és a futó egyenleg is változik.');
  return out;
}
