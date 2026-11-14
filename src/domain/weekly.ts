import { addDays, differenceInCalendarDays } from 'date-fns';
import type { Summaries } from './balance';
import { formatFt } from './money';
import { article } from './pace';
import { fromISO, MONTHS_SHORT, periodAdjective, periodEnd, periodForDate, periodStart, shortDate, toISO, type PeriodConfig } from './periods';
import { dueDateInPeriod } from './status';
import type { BudgetData, Category, Entry, ISODate, PeriodId } from './types';

/**
 * Az Elemzés heti nézete. A hét naptári hét (hétfőtől vasárnapig), és a rögzítés napja szerint számol, nem a
 * hónap (időszak) szerint, így egy hét két hónapba is eshet.
 *
 * A heti összeg csak a keretekből, a havi pénzből elment költés: a számlák egy-egy héten többszörösére növelnék,
 * ezért külön sorban állnak. A megtakarításból fizetett költés a kategória sorában külön látszik, az összegbe és
 * az átlagba nem számít. A „Havi összeg megadása” rögzítései egy egész hónapot fednek le, ezért kimaradnak.
 *
 * A hétnek nincs saját terve: a mérce az előző legfeljebb négy teljes hét átlaga.
 */

/** Az átlag ennyi megelőző hétből számol. */
export const AVG_WEEKS = 4;
/** „A szokásosnál több”: az átlagnál legalább ennyiszer több, és legalább MORE_MIN forinttal. */
const MORE_RATIO = 1.15;
const MORE_MIN = 1000;

const WEEKDAYS = ['hétfő', 'kedd', 'szerda', 'csütörtök', 'péntek', 'szombat', 'vasárnap'];
const WEEKDAYS_ON = ['hétfőn', 'kedden', 'szerdán', 'csütörtökön', 'pénteken', 'szombaton', 'vasárnap'];
const WEEKDAYS_UNTIL = ['hétfőig', 'keddig', 'szerdáig', 'csütörtökig', 'péntekig', 'szombatig', 'vasárnapig'];
export const WEEKDAYS_SHORT = ['H', 'K', 'Sze', 'Cs', 'P', 'Szo', 'V'];

const plus = (d: ISODate, n: number) => toISO(addDays(fromISO(d), n));
/** A nap sorszáma a héten belül: hétfő 0, vasárnap 6. */
const dayIndex = (d: ISODate) => (fromISO(d).getDay() + 6) % 7;

/** 'csütörtök' */
export function weekdayName(d: ISODate): string {
  return WEEKDAYS[dayIndex(d)];
}

/** A dátum hetének hétfője. */
export function weekStart(d: ISODate): ISODate {
  return plus(d, -dayIndex(d));
}

export function shiftWeek(start: ISODate, n: number): ISODate {
  return plus(start, 7 * n);
}

/** A legkorábbi rögzítés napja; null, ha még nincs rögzítés. */
export function recordingStart(entries: Pick<Entry, 'date'>[]): ISODate | null {
  let min: ISODate | null = null;
  for (const e of entries) if (min === null || e.date < min) min = e.date;
  return min;
}

/** A legkorábbi hét, amelyre vissza lehet lépni: az első rögzítés hete (rögzítés nélkül a mostani). */
export function firstWeek(entries: Pick<Entry, 'date'>[], today: ISODate): ISODate {
  const cur = weekStart(today);
  const first = recordingStart(entries);
  return first !== null && first < cur ? weekStart(first) : cur;
}

export interface WeekDay {
  date: ISODate;
  /** A keretekből aznap elment összeg. */
  amount: number;
  state: 'past' | 'today' | 'future';
}

export interface WeekRow {
  cat: Category;
  /** A héten a havi pénzből elment összeg. */
  amount: number;
  /** A héten megtakarításból fizetve (az összegben és az átlagban nincs benne). */
  fromSavings: number;
  /** A hét rögzítéseinek száma. */
  count: number;
  /** Az előző hetek átlaga; null, ha a kategóriának még nincs teljes megelőző hete. */
  avg: number | null;
  /** Hány hétből áll az átlag (0–AVG_WEEKS). */
  avgWeeks: number;
  /** A szokásosnál több ment el. */
  more: boolean;
  /** Csak a folyamatban lévő héten, tervvel rendelkező keretnél: ennyi maradt a havi keretből (túllépésnél negatív). */
  left: number | null;
}

export interface WeekBill {
  cat: Category;
  amount: number;
  date: ISODate;
  /** Csoportos beszedés: rögzítés nélkül, az esedékesség napján. */
  auto: boolean;
}

export interface WeekSplit {
  first: PeriodId;
  second: PeriodId;
  /** A második hónap első napja. */
  secondStart: ISODate;
}

export interface WeekSummary {
  start: ISODate;
  end: ISODate;
  /** A mai napot tartalmazó hét még folyamatban van. */
  current: boolean;
  days: WeekDay[];
  /** A héten a keretekből elment összeg. */
  total: number;
  /** A kategóriák átlagainak összege; null, ha egyiknek sincs átlaga. */
  avgTotal: number | null;
  /** A leghosszabb átlag ennyi hétből áll. */
  avgWeeks: number;
  /** Kategóriák, amelyekre a héten volt költés, a költés szerint csökkenőn. */
  rows: WeekRow[];
  /** Keretek, amelyekre az előző hetekben volt költés, ezen a héten nem. */
  quiet: WeekRow[];
  /** A héten kifizetett számlák, dátum szerint. */
  bills: WeekBill[];
  billsTotal: number;
  /** Keretek, amelyeknek a hetet érintő hónapját havi összeggel rögzítették, ezért nincs heti bontásuk. */
  monthly: Category[];
  /** Ha a hét két hónapba esik. */
  split: WeekSplit | null;
}

interface Acc {
  /** A 0. a megjelenített hét, az 1–AVG_WEEKS. az előző hetek. */
  weeks: number[];
  fromSavings: number;
  count: number;
  /** A kategória első tételes rögzítésének napja. */
  first: ISODate | null;
  /** A havi összeggel rögzített hónapok első és utolsó napja. */
  monthly: [ISODate, ISODate][];
}

export function weekSummary(
  data: Pick<BudgetData, 'categories' | 'entries'>,
  s: Summaries,
  cfg: PeriodConfig,
  weekOf: ISODate,
  today: ISODate,
): WeekSummary {
  const start = weekStart(weekOf);
  const end = plus(start, 6);
  const from = shiftWeek(start, -AVG_WEEKS);
  const current = start === weekStart(today);
  const cats = new Map(data.categories.map((c) => [c.id, c]));
  const overlaps = (a: ISODate, b: ISODate) => a <= end && b >= start;
  const inWeek = (d: ISODate) => d >= start && d <= end;

  const accs = new Map<string, Acc>();
  const acc = (id: string) => {
    let a = accs.get(id);
    if (!a) accs.set(id, (a = { weeks: new Array<number>(AVG_WEEKS + 1).fill(0), fromSavings: 0, count: 0, first: null, monthly: [] }));
    return a;
  };
  const dayTotals = new Array<number>(7).fill(0);
  const billByCat = new Map<string, WeekBill>();
  const recStart = recordingStart(data.entries);

  for (const e of data.entries) {
    if (e.kind === 'withdrawal') {
      const spendCat = e.spendCategoryId ? cats.get(e.spendCategoryId) : undefined;
      if (spendCat?.type === 'keret' && inWeek(e.date)) {
        const a = acc(spendCat.id);
        a.fromSavings += e.amount;
        a.count++;
      }
      continue;
    }
    const c = cats.get(e.categoryId);
    if (!c) continue;
    if (c.type === 'fix') {
      if (e.amount > 0 && inWeek(e.date)) {
        const b = billByCat.get(c.id);
        if (b) {
          b.amount += e.amount;
          if (e.date > b.date) b.date = e.date;
        } else billByCat.set(c.id, { cat: c, amount: e.amount, date: e.date, auto: false });
      }
      continue;
    }
    if (c.type !== 'keret') continue;
    const a = acc(c.id);
    if (e.monthlyTotal) {
      a.monthly.push([periodStart(e.periodId, cfg), periodEnd(e.periodId, cfg)]);
      continue;
    }
    if (a.first === null || e.date < a.first) a.first = e.date;
    if (e.date < from || e.date > end) continue;
    const k = -Math.floor(differenceInCalendarDays(fromISO(e.date), fromISO(start)) / 7);
    a.weeks[k] += e.amount;
    if (k === 0) {
      a.count++;
      dayTotals[dayIndex(e.date)] += e.amount;
    }
  }

  const curFigs = current ? s.byId.get(s.currentId)?.byCategory : undefined;
  const rows: WeekRow[] = [];
  const quiet: WeekRow[] = [];
  const monthly: Category[] = [];
  let total = 0;
  let avgTotal: number | null = null;
  let avgWeeks = 0;

  for (const [id, a] of accs) {
    const cat = cats.get(id)!;
    let sum = 0;
    let n = 0;
    for (let k = 1; k <= AVG_WEEKS; k++) {
      const ws = shiftWeek(start, -k);
      const we = plus(ws, 6);
      // Csak teljes, már rögzített hét számít: a rögzítés kezdete előtti és a kategória első tétele előtti nem,
      // és az sem, amelyiknek a hónapja havi összeggel van rögzítve (annak nincs heti bontása, nem nulla).
      if (recStart === null || ws < recStart || a.first === null || we < a.first) continue;
      if (a.monthly.some(([ms, me]) => ms <= we && me >= ws)) continue;
      sum += a.weeks[k];
      n++;
    }
    const avg = n > 0 ? Math.round(sum / n) : null;
    const amount = a.weeks[0];
    const f = curFigs?.get(id);
    const row: WeekRow = {
      cat,
      amount,
      fromSavings: a.fromSavings,
      count: a.count,
      avg,
      avgWeeks: n,
      more: avg !== null && avg > 0 && amount >= avg * MORE_RATIO && amount - avg >= MORE_MIN,
      left: f && f.plan > 0 ? f.plan - f.actual : null,
    };
    total += amount;
    if (avg !== null) {
      avgTotal = (avgTotal ?? 0) + avg;
      avgWeeks = Math.max(avgWeeks, n);
    }
    if (a.monthly.some(([ms, me]) => overlaps(ms, me))) monthly.push(cat);
    if (amount > 0 || a.fromSavings > 0) rows.push(row);
    else if (!cat.archived && avg !== null && avg > 0) quiet.push(row);
  }
  rows.sort((a, b) => b.amount + b.fromSavings - (a.amount + a.fromSavings) || a.cat.order - b.cat.order);
  quiet.sort((a, b) => a.cat.order - b.cat.order);
  monthly.sort((a, b) => a.order - b.order);

  // Csoportos beszedés: nincs rögzítése, az esedékesség napján számít kifizetettnek.
  const bills = [...billByCat.values()];
  for (const p of s.periods) {
    if (!overlaps(p.start, p.end)) continue;
    for (const c of data.categories) {
      const f = p.byCategory.get(c.id);
      if (!f?.auto || !c.dueDay) continue;
      const due = dueDateInPeriod(c.dueDay, p.start, p.end);
      if (due && inWeek(due)) bills.push({ cat: c, amount: f.actual, date: due, auto: true });
    }
  }
  bills.sort((a, b) => a.date.localeCompare(b.date) || a.cat.order - b.cat.order);

  const first = periodForDate(start, cfg);
  const second = periodForDate(end, cfg);

  return {
    start,
    end,
    current,
    days: dayTotals.map((amount, i) => {
      const date = plus(start, i);
      return { date, amount, state: date < today ? 'past' : date === today ? 'today' : 'future' };
    }),
    total,
    avgTotal,
    avgWeeks,
    rows,
    quiet,
    bills,
    billsTotal: bills.reduce((sum, b) => sum + b.amount, 0),
    monthly,
    split: first === second ? null : { first, second, secondStart: periodStart(second, cfg) },
  };
}

/** Egy kategória rögzítései a héten (a megtakarításból fizetett költéssel együtt), a legújabbtól. */
export function weekEntries(entries: Entry[], categoryId: string, start: ISODate): Entry[] {
  const end = plus(start, 6);
  return entries
    .filter(
      (e) =>
        e.date >= start && e.date <= end && !e.monthlyTotal &&
        (e.kind === 'withdrawal' ? e.spendCategoryId === categoryId : e.categoryId === categoryId),
    )
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

// --- Szövegek ----------------------------------------------------------------

/** 'nov. 9–15.', hónaphatáron 'okt. 26. – nov. 1.'; a mai évtől eltérő évben az évszámmal. */
export function weekTitle(start: ISODate, today: ISODate): string {
  const a = fromISO(start);
  const b = addDays(a, 6);
  const month = (d: Date) => `${MONTHS_SHORT[d.getMonth()].toLowerCase()}.`;
  const thisYear = fromISO(today).getFullYear();
  if (a.getFullYear() !== b.getFullYear()) {
    return `${a.getFullYear()}. ${month(a)} ${a.getDate()}. – ${b.getFullYear()}. ${month(b)} ${b.getDate()}.`;
  }
  const year = a.getFullYear() === thisYear ? '' : `${a.getFullYear()}. `;
  if (a.getMonth() === b.getMonth()) return `${year}${month(a)} ${a.getDate()}–${b.getDate()}.`;
  return `${year}${month(a)} ${a.getDate()}. – ${month(b)} ${b.getDate()}.`;
}

/** 'ez a hét, csütörtökig', 'múlt hét', '3 héttel ezelőtt'. */
export function weekRelative(start: ISODate, today: ISODate): string {
  const n = Math.round(differenceInCalendarDays(fromISO(weekStart(today)), fromISO(start)) / 7);
  if (n <= 0) return dayIndex(today) === 6 ? 'ez a hét' : `ez a hét, ${WEEKDAYS_UNTIL[dayIndex(today)]}`;
  return n === 1 ? 'múlt hét' : `${n} héttel ezelőtt`;
}

/** A mérce neve: 'az előző 4 hét átlaga', egy hétnél 'az előző hét'. */
export function avgName(weeks: number): string {
  return weeks === 1 ? 'az előző hét' : `az előző ${weeks} hét átlaga`;
}

export interface WeekSentence {
  strong: string;
  rest: string;
  /** A kiemelt rész figyelmeztető színt kap. */
  warn: boolean;
}

/** A hét összege alatti mondat: a folyamatban lévő héten a hátralévő napok, a lezárton az eltérés az átlagtól. */
export function weekSentence(w: WeekSummary): WeekSentence {
  const avg = w.avgTotal;
  if (w.current) {
    const left = w.days.filter((d) => d.state === 'future').length;
    const strong = left === 0 ? 'Ma van a hét utolsó napja.' : `Még ${left} nap van hátra a hétből.`;
    const rest =
      avg === null
        ? 'Az összevetéshez legalább egy teljes hét rögzítése kell.'
        : w.avgWeeks === 1
          ? `Az előző héten ${formatFt(avg)} ment el.`
          : `Az előző ${w.avgWeeks} hét átlaga ${formatFt(avg)} volt.`;
    return { strong, rest, warn: false };
  }
  if (avg === null) return { strong: '', rest: 'Ehhez a héthez nincs korábbi teljes hét, amihez mérni lehetne.', warn: false };
  const diff = w.total - avg;
  const ref = `mint ${avgName(w.avgWeeks)} (${formatFt(avg)}).`;
  if (Math.abs(diff) < MORE_MIN) return { strong: 'Nagyjából annyi,', rest: ref, warn: false };
  return {
    strong: `${formatFt(Math.abs(diff))}-tal ${diff > 0 ? 'több' : 'kevesebb'},`,
    rest: ref,
    warn: diff > 0 && w.total >= avg * MORE_RATIO,
  };
}

/** A napi átlag (a szaggatott vonal helye); null, ha nincs mihez mérni. */
export function dailyAverage(w: WeekSummary): number | null {
  return w.avgTotal !== null && w.avgTotal > 0 ? Math.round(w.avgTotal / 7) : null;
}

/** A napi oszlopok alatti mondat: melyik napon ment el a legtöbb, és mit jelöl a szaggatott vonal. */
export function daysSentence(w: WeekSummary): { strong: string; rest: string } {
  const max = w.days.reduce((m, d) => (d.amount > m.amount ? d : m), w.days[0]);
  const avg = dailyAverage(w);
  return {
    strong: max.amount > 0 ? `A legtöbb ${WEEKDAYS_ON[dayIndex(max.date)]} ment el: ${formatFt(max.amount)}.` : '',
    rest:
      avg === null
        ? ''
        : `A szaggatott vonal ${w.avgWeeks === 1 ? 'az előző hét' : `az előző ${w.avgWeeks} hét`} napi átlaga, ${formatFt(avg)}.`,
  };
}

/** A napi oszlopok szöveges megfelelője a felolvasónak. */
export function daysDescription(w: WeekSummary): string {
  const parts = w.days.map((d) => `${weekdayName(d.date)} ${d.state === 'future' && d.amount === 0 ? 'még nincs adat' : formatFt(d.amount)}`);
  return `A keretekből elment összeg naponta: ${parts.join(', ')}.`;
}

/** A két hónapba eső hét magyarázata. */
export function splitSentence(split: WeekSplit, today: ISODate): string {
  const second = periodAdjective(split.second, split.second);
  const first = periodAdjective(split.first, split.second);
  const past = split.secondStart <= today;
  return (
    `${article(second)} ${second} hónap ezen a héten ${past ? 'kezdődött' : 'kezdődik'} (${shortDate(split.secondStart)}, ${weekdayName(split.secondStart)}), ` +
    `${past ? 'előtte' : 'addig'} még ${article(first).toLowerCase()} ${first} ${past ? 'tartott' : 'tart'}. A heti nézet a rögzítés napja szerint számol.`
  );
}

/** A számlák sorának alcíme: 'Internet és Villany', háromnál többnél 'Lakbér, Gáz és még 2'. */
export function billNames(bills: WeekBill[]): string {
  const names = [...new Set(bills.map((b) => b.cat.name))];
  if (names.length <= 1) return names[0] ?? '';
  if (names.length <= 3) return `${names.slice(0, -1).join(', ')} és ${names.at(-1)}`;
  return `${names.slice(0, 2).join(', ')} és még ${names.length - 2}`;
}
