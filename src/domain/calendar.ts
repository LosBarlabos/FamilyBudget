import { addDays } from 'date-fns';
import type { Summaries } from './balance';
import { formatFt } from './money';
import { fromISO, toISO } from './periods';
import { dueDateInPeriod, fixStatus } from './status';
import { recordStyle, type Category, type ISODate, type PeriodId } from './types';

/**
 * A naptár egy tételének állapota: 'auto' a csoportos beszedéssel (rögzítés nélkül) kifizetett számla,
 * 'overdue' a lejárt, még nyitott számla.
 */
export type CalendarState = 'paid' | 'auto' | 'partial' | 'open' | 'overdue';

export interface CalendarEvent {
  date: ISODate;
  periodId: PeriodId;
  cat: Category;
  kind: 'bill' | 'income';
  /** Kifizetettnél (lezártnál) a tény, egyébként a terv. */
  amount: number;
  state: CalendarState;
  /** Csoportos beszedésű számla (akkor is, ha az esedékessége még nem jött el). */
  autoPay: boolean;
}

/**
 * Az esedékességi nappal rendelkező fix számlák és az egyösszegű bevételek a [from, to] napokon, dátum
 * szerint. A bevétel az érkezés napján, ennek hiányában az időszak első napján (fizetésnap) látszik.
 */
export function calendarEvents(categories: Category[], s: Summaries, from: ISODate, to: ISODate, today: ISODate): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  for (const p of s.periods) {
    if (p.end < from || p.start > to) continue;
    for (const c of categories) {
      const f = p.byCategory.get(c.id);
      if (c.archived || !f || (f.plan <= 0 && f.actual <= 0)) continue;
      const bill = c.type === 'fix' && !!c.dueDay;
      const income = c.type === 'bevetel' && recordStyle(c) === 'fix';
      if (!bill && !income) continue;
      const date = c.dueDay ? dueDateInPeriod(c.dueDay, p.start, p.end) : p.start;
      if (!date || date < from || date > to) continue;
      const st = fixStatus(f.plan, f.actual, f.settled);
      const done = st === 'paid' || st === 'paidDiff';
      const state: CalendarState = f.auto
        ? 'auto'
        : done
          ? 'paid'
          : st === 'partial'
            ? 'partial'
            : bill && date < today
              ? 'overdue'
              : 'open';
      out.push({
        date,
        periodId: p.id,
        cat: c,
        kind: bill ? 'bill' : 'income',
        amount: done ? f.actual : f.plan,
        state,
        autoPay: bill && !!c.autoPayFrom && p.id >= c.autoPayFrom,
      });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.kind === b.kind ? 0 : a.kind === 'income' ? -1 : 1) || a.cat.order - b.cat.order);
}

// --- Naptárfájl (.ics) ---------------------------------------------------------

export interface IcsBill {
  /** Időszakonként állandó: újraimportáláskor a naptár ugyanazt az eseményt frissíti. */
  uid: string;
  date: ISODate;
  title: string;
}

/**
 * A naptárfájl számlái mától az előrejelzés végéig, állapottól függetlenül (a kifizetés ne tegye elavulttá a
 * letöltött fájlt), a terv összegével.
 */
export function icsBills(categories: Category[], s: Summaries, today: ISODate): IcsBill[] {
  const last = s.periods.at(-1);
  if (!last) return [];
  return calendarEvents(categories, s, today, last.end, today)
    .filter((e) => e.kind === 'bill')
    .map((e) => {
      const plan = s.byId.get(e.periodId)?.byCategory.get(e.cat.id)?.plan ?? e.amount;
      return {
        uid: `${e.periodId}-${e.cat.id}@csaladi-koltsegvetes`,
        date: e.date,
        title: `${e.cat.name} · ${formatFt(plan)}${e.autoPay ? ' (csoportos beszedés)' : ''}`,
      };
    });
}

/** Az emlékeztető ennyivel az esedékesség napjának kezdete előtt szól: előző este 20:00-kor. */
const ALARM_BEFORE = '-PT4H';

const icsDate = (d: ISODate) => d.replaceAll('-', '');

function icsText(t: string): string {
  return t.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** RFC 5545: a 75 bájtnál hosszabb sor szóközzel kezdődő folytatósorokba törik (karakter közepén nem). */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  const parts: string[] = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    // Az első sor 75, a folytatósorok a kezdő szóközzel együtt 75 bájtosak.
    if (bytes + n > (parts.length === 0 ? 75 : 74)) {
      parts.push(cur);
      cur = '';
      bytes = 0;
    }
    cur += ch;
    bytes += n;
  }
  parts.push(cur);
  return parts.join('\r\n ');
}

/** A számlák naptárfájlja egész napos eseményekkel és előző esti emlékeztetővel. */
export function buildIcs(bills: IcsBill[], now: Date): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Csaladi koltsegvetes//Szamlanaptar//HU',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Számlák',
  ];
  for (const b of bills) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${b.uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDate(b.date)}`,
      `DTEND;VALUE=DATE:${icsDate(toISO(addDays(fromISO(b.date), 1)))}`,
      `SUMMARY:${icsText(b.title)}`,
      'TRANSP:TRANSPARENT',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${icsText(`Holnap esedékes: ${b.title}`)}`,
      `TRIGGER:${ALARM_BEFORE}`,
      'END:VALARM',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

/** A letöltött naptárfájl lenyomata: meddig tartott, és eseményenként a dátum és a cím. */
export interface IcsSnapshot {
  until: ISODate;
  events: Record<string, string>;
}

export function icsSnapshot(bills: IcsBill[]): IcsSnapshot | null {
  if (bills.length === 0) return null;
  return {
    until: bills.reduce((m, b) => (b.date > m ? b.date : m), bills[0].date),
    events: Object.fromEntries(bills.map((b) => [b.uid, `${b.date}|${b.title}`])),
  };
}

/**
 * Elavult-e a letöltött naptárfájl: a mától a fájl végéig tartó szakaszon eltér-e egy esemény dátuma vagy címe,
 * hiányzik-e egy, vagy van-e új. A fájl vége utáni (később hozzáférhető) hónapok nem számítanak.
 */
export function icsStale(saved: IcsSnapshot, bills: IcsBill[], today: ISODate): boolean {
  const now = new Map<string, string>();
  for (const b of bills) if (b.date >= today && b.date <= saved.until) now.set(b.uid, `${b.date}|${b.title}`);
  const before = Object.entries(saved.events).filter(([, v]) => v.slice(0, 10) >= today);
  if (before.length !== now.size) return true;
  return before.some(([uid, v]) => now.get(uid) !== v);
}
