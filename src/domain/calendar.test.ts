import { describe, expect, it } from 'vitest';
import { computeSummaries } from './balance';
import { formatFt } from './money';
import { buildIcs, calendarEvents, foldLine, icsBills, icsSnapshot, icsStale, type IcsBill } from './calendar';
import type { BudgetData, Category, Entry } from './types';

const cat = (id: string, type: Category['type'], defaultAmount: number, extra: Partial<Category> = {}): Category => ({
  id, name: id, icon: 'dots', color: '#000', type, defaultAmount, order: 0, archived: false, ...extra,
});

let n = 0;
const entry = (periodId: string, categoryId: string, amount: number, extra: Partial<Entry> = {}): Entry => ({
  id: `e${n++}`, periodId, categoryId, amount, date: `${periodId}-15`, createdAt: '2026-01-01T00:00:00Z', ...extra,
});

function data(entries: Entry[] = [], categories?: Category[]): BudgetData {
  return {
    settings: {
      id: 'settings', payday: 10, openingBalance: 0, firstPeriodId: '2026-09',
      forecastPeriods: 2, createdAt: '2026-09-10T00:00:00Z',
    },
    categories: categories ?? [
      cat('fizetes', 'bevetel', 820_000),
      cat('potlek', 'bevetel', 26_000, { dueDay: 20 }),
      cat('alkalmi', 'bevetel', 50_000, { incomeMode: 'keret' }),
      cat('hitel', 'fix', 185_000, { dueDay: 15 }),
      cat('aram', 'fix', 14_000, { dueDay: 15, autoPayFrom: '2026-09' }),
      cat('telefon', 'fix', 8_000, { dueDay: 25 }),
      cat('biztositas', 'fix', 30_000),
      cat('kaja', 'keret', 180_000),
    ],
    plans: [],
    entries,
    overrides: [],
  };
}

// Ma: 2026-10-20 → a folyamatban lévő időszak '2026-10' (10.10–11.09.)
const TODAY = '2026-10-20';

describe('számlanaptár', () => {
  const events = (d: BudgetData, from = '2026-10-10', to = '2026-11-09') =>
    calendarEvents(d.categories, computeSummaries(d, TODAY), from, to, TODAY).map((e) => `${e.date} ${e.cat.id} ${e.state} ${e.amount}`);

  it('a számlák az esedékességükön, a bevételek az érkezésükön vagy a fizetésnapon', () => {
    expect(events(data([entry('2026-10', 'hitel', 185_000, { settles: true })]))).toEqual([
      '2026-10-10 fizetes open 820000',
      '2026-10-15 hitel paid 185000',
      '2026-10-15 aram auto 14000',
      '2026-10-20 potlek open 26000',
      '2026-10-25 telefon open 8000',
    ]);
  });

  it('a lejárt, nyitott számla és a részben fizetett', () => {
    const d = data([entry('2026-10', 'telefon', 3_000)]);
    const s = computeSummaries(d, '2026-10-26');
    const st = calendarEvents(d.categories, s, '2026-10-10', '2026-11-09', '2026-10-26').map((e) => `${e.cat.id} ${e.state}`);
    expect(st).toContain('hitel overdue');
    expect(st).toContain('telefon partial');
  });

  it('a csoportos beszedésű számla az esedékesség előtt nyitott, de jelölve van', () => {
    const d = data();
    const e = calendarEvents(d.categories, computeSummaries(d, '2026-10-12'), '2026-10-10', '2026-11-09', '2026-10-12').find((x) => x.cat.id === 'aram')!;
    expect(e).toMatchObject({ state: 'open', autoPay: true });
  });

  it('csak a kért napok, akár két időszakból', () => {
    expect(events(data(), '2026-11-01', '2026-11-30')).toEqual([
      '2026-11-10 fizetes open 820000',
      '2026-11-15 hitel open 185000',
      '2026-11-15 aram open 14000',
      '2026-11-20 potlek open 26000',
      '2026-11-25 telefon open 8000',
    ]);
  });

  it('archivált és terv nélküli tétel nem jelenik meg', () => {
    const d = data([], [cat('hitel', 'fix', 185_000, { dueDay: 15, archived: true }), cat('aram', 'fix', 0, { dueDay: 15 })]);
    expect(events(d)).toEqual([]);
  });
});

describe('naptárfájl', () => {
  it('számlánként egy esemény mától az előrejelzés végéig, a terv összegével', () => {
    const d = data([entry('2026-10', 'hitel', 190_000, { settles: true })]);
    const bills = icsBills(d.categories, computeSummaries(d, TODAY), TODAY);
    expect(bills.map((b) => `${b.date} ${b.uid}`)).toEqual([
      '2026-10-25 2026-10-telefon@csaladi-koltsegvetes',
      '2026-11-15 2026-11-hitel@csaladi-koltsegvetes',
      '2026-11-15 2026-11-aram@csaladi-koltsegvetes',
      '2026-11-25 2026-11-telefon@csaladi-koltsegvetes',
      '2026-12-15 2026-12-hitel@csaladi-koltsegvetes',
      '2026-12-15 2026-12-aram@csaladi-koltsegvetes',
      '2026-12-25 2026-12-telefon@csaladi-koltsegvetes',
    ]);
    expect(bills[1].title).toBe(`hitel · ${formatFt(185_000)}`);
    expect(bills[2].title).toBe(`aram · ${formatFt(14_000)} (csoportos beszedés)`);
  });

  it('egész napos esemény, előző esti emlékeztetővel, CRLF sorvégekkel', () => {
    const ics = buildIcs([{ uid: 'u1', date: '2026-10-31', title: 'Áram; gáz, víz · 14 000 Ft' }], new Date('2026-10-22T12:34:56.789Z'));
    const lines = ics.split('\r\n');
    expect(lines[0]).toBe('BEGIN:VCALENDAR');
    expect(lines).toContain('DTSTAMP:20261022T123456Z');
    expect(lines).toContain('DTSTART;VALUE=DATE:20261031');
    expect(lines).toContain('DTEND;VALUE=DATE:20261101');
    expect(lines).toContain('SUMMARY:Áram\\; gáz\\, víz · 14 000 Ft');
    expect(lines).toContain('TRIGGER:-PT4H');
    expect(lines.at(-2)).toBe('END:VCALENDAR');
    expect(ics.endsWith('\r\n')).toBe(true);
  });

  it('a hosszú sor 75 bájtonként törik, ékezetes betű közepén nem', () => {
    const line = 'SUMMARY:' + 'á'.repeat(60);
    const folded = foldLine(line).split('\r\n');
    const enc = new TextEncoder();
    expect(folded.length).toBeGreaterThan(1);
    for (const l of folded) expect(enc.encode(l).length).toBeLessThanOrEqual(75);
    expect(folded.slice(1).every((l) => l.startsWith(' '))).toBe(true);
    expect(folded.map((l, i) => (i ? l.slice(1) : l)).join('')).toBe(line);
  });
});

describe('elavult naptárfájl', () => {
  const b = (uid: string, date: string, title = uid): IcsBill => ({ uid, date, title });
  const saved = icsSnapshot([b('a', '2026-10-15'), b('b', '2026-10-25'), b('c', '2026-11-25')])!;

  it('változatlan számlák mellett friss, a fájl vége utáni új hónap nem számít', () => {
    expect(saved.until).toBe('2026-11-25');
    expect(icsStale(saved, [b('a', '2026-10-15'), b('b', '2026-10-25'), b('c', '2026-11-25'), b('d', '2026-12-25')], TODAY)).toBe(false);
  });

  it('a múltbeli esemény változása nem számít', () => {
    expect(icsStale(saved, [b('b', '2026-10-25'), b('c', '2026-11-25')], TODAY)).toBe(false);
  });

  it('elavult, ha egy jövőbeli esemény dátuma vagy címe más, ha új van, vagy ha eltűnt egy', () => {
    expect(icsStale(saved, [b('b', '2026-10-26'), b('c', '2026-11-25')], TODAY)).toBe(true);
    expect(icsStale(saved, [b('b', '2026-10-25', 'más'), b('c', '2026-11-25')], TODAY)).toBe(true);
    expect(icsStale(saved, [b('b', '2026-10-25'), b('c', '2026-11-25'), b('e', '2026-11-01')], TODAY)).toBe(true);
    expect(icsStale(saved, [b('b', '2026-10-25')], TODAY)).toBe(true);
  });
});
