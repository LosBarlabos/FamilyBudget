import { describe, expect, it } from 'vitest';
import { computeSummaries } from './balance';
import { goalProgress } from './goals';
import { paceOverview } from './pace';
import { settleLabel, settleMessage } from './status';
import { buildTodos, daysSinceLastEntry, todoText, type Todo } from './todos';
import type { BudgetData, Category, Entry } from './types';

const sp = (s: string) => s.replace(/\s/g, ' ');

let order = 0;
const cat = (id: string, type: Category['type'], defaultAmount: number, extra: Partial<Category> = {}): Category => ({
  id, name: id, icon: 'dots', color: '#000', type, defaultAmount, order: order++, archived: false, ...extra,
});

let n = 0;
const entry = (periodId: string, categoryId: string, amount: number, extra: Partial<Entry> = {}): Entry => ({
  id: `e${n++}`, periodId, categoryId, amount, date: `${periodId}-15`, createdAt: '2026-10-18T10:00:00Z', ...extra,
});

// A folyamatban lévő időszak '2026-10' (10.10–11.09.)
const categories = [
  cat('fiz', 'bevetel', 500_000, { name: 'Fizetés', incomeMode: 'fix' }),
  cat('pot', 'bevetel', 30_000, { name: 'Családi pótlék', incomeMode: 'fix' }),
  cat('egyeb', 'bevetel', 10_000, { incomeMode: 'keret' }),
  cat('aram', 'fix', 18_000, { name: 'Áram', dueDay: 15 }),
  cat('net', 'fix', 9_000, { name: 'Internet', dueDay: 24 }),
  cat('gaz', 'fix', 12_000, { dueDay: 30 }),
  cat('tel', 'fix', 6_000, { dueDay: 12 }),
  cat('hitel', 'fix', 120_000, { dueDay: 5 }),
  cat('nincsnap', 'fix', 5_000),
  cat('kaja', 'keret', 200_000, { name: 'Élelmiszer' }),
  cat('szabad', 'keret', 30_000, { name: 'Szabadidő' }),
  cat('varatlan', 'keret', 20_000, { role: 'unexpected' }),
  cat('nyaralas', 'megtakaritas', 10_000, { name: 'Nyaralás', goalAmount: 600_000, goalDeadline: '2027-03' }),
];

function setup(
  today: string, entries: Entry[], backup = { stale: false, days: 3 as number | null }, overrides: BudgetData['overrides'] = [], cats = categories,
) {
  const categories = cats;
  const d: BudgetData = {
    settings: { id: 'settings', payday: 10, openingBalance: 0, firstPeriodId: '2026-09', forecastPeriods: 1, createdAt: '2026-09-01T00:00:00Z' },
    categories, plans: [], entries, overrides,
  };
  const s = computeSummaries(d, today);
  const period = s.byId.get(s.currentId)!;
  const goals = categories.filter((c) => c.type === 'megtakaritas').map((c) => ({ cat: c, g: goalProgress(c, d, s.currentId) }));
  return buildTodos({
    categories, entries, period, today, goals, backup,
    pace: paceOverview(categories, period, today),
    createdAt: d.settings.createdAt,
  });
}

const base = [
  entry('2026-10', 'pot', 10_000),
  entry('2026-10', 'tel', 6_000, { settles: true }),
  entry('2026-10', 'kaja', 120_000),
  entry('2026-10', 'szabad', 35_000),
  entry('2026-10', 'varatlan', 25_000),
];

describe('teendők', () => {
  const todos = setup('2026-10-20', base, { stale: true, days: 40 });

  it('fontossági sorrendben: számlák, bevétel, keretek, célok, mentés', () => {
    expect(todos.map((t) => t.kind)).toEqual(['bill', 'bill', 'income', 'income', 'envelope', 'envelope', 'goal', 'backup']);
  });

  it('a lejárt és az 5 napon belül esedékes, le nem zárt számla', () => {
    const bills = todos.filter((t): t is Extract<Todo, { kind: 'bill' }> => t.kind === 'bill');
    // Az esedékesség nélküli, a lezárt, a 10 nap múlva és a következő hónapban esedékes számla kimarad.
    expect(bills.map((b) => [b.cat.id, b.due, b.overdue])).toEqual([
      ['aram', '2026-10-15', true],
      ['net', '2026-10-24', false],
    ]);
    expect(sp(todoText(bills[0], '2026-10-20'))).toBe('Áram · lejárt okt. 15. · 18 000 Ft');
    expect(sp(todoText(bills[1], '2026-10-20'))).toBe('Internet · esedékes okt. 24. · 9 000 Ft');
    expect(sp(todoText(bills[1], '2026-10-24'))).toBe('Internet · ma esedékes · 9 000 Ft');
  });

  it('az egyösszegű bevétel a 3. nap után, a részben megérkezett a hiányzó összeggel', () => {
    const inc = todos.filter((t) => t.kind === 'income');
    expect(inc.map((t) => sp(todoText(t, '2026-10-20')))).toEqual([
      'Fizetés még nem érkezett meg · 500 000 Ft',
      'Családi pótlék: még 20 000 Ft nem érkezett meg',
    ]);
    expect(setup('2026-10-12', base).some((t) => t.kind === 'income')).toBe(false);
    expect(setup('2026-10-13', base).some((t) => t.kind === 'income')).toBe(true);
  });

  it('legfeljebb 2 túlfutó keret, a várható túllépés szerint', () => {
    const env = todos.filter((t) => t.kind === 'envelope');
    expect(env.map((t) => sp(todoText(t, '2026-10-20')))).toEqual([
      'Élelmiszer: gyorsabban fogy a tervezettnél · ~138 200 Ft túllépés várható',
      'Szabadidő: 5 000 Ft-tal túllépve',
    ]);
  });

  it('a lemaradó cél a szükséges havi összeggel', () => {
    const g = todos.find((t) => t.kind === 'goal')!;
    expect(sp(todoText(g, '2026-10-20'))).toBe('Nyaralás: lemarad a céltól · havi 100 000 Ft kellene');
  });

  it('rögzítés nélküli napok és elavult mentés', () => {
    const idle = setup('2026-10-25', base);
    expect(idle.at(-1)).toEqual({ kind: 'idle', days: 7 });
    expect(todoText({ kind: 'idle', days: 7 }, '2026-10-25')).toBe('7 napja nem rögzítettél semmit');
    expect(setup('2026-10-22', base).some((t) => t.kind === 'idle')).toBe(false);
    expect(todoText({ kind: 'backup', days: 40 }, '2026-10-20')).toBe('40 napja nem mentetted le az adatokat');
    expect(todoText({ kind: 'backup', days: null }, '2026-10-20')).toBe('Még nem mentetted le az adatokat');
  });

  it('rögzítés nélkül a létrehozástól számol', () => {
    expect(daysSinceLastEntry([], '2026-10-01T12:00:00Z', '2026-10-20')).toBe(19);
    expect(daysSinceLastEntry([], '', '2026-10-20')).toBe(0);
  });

  it('ha minden rendben, üres a lista', () => {
    const done = [
      ...categories.filter((c) => c.type === 'fix' || (c.type === 'bevetel' && c.incomeMode === 'fix')).map((c) => entry('2026-10', c.id, c.defaultAmount, { settles: true })),
      entry('2026-10', 'nyaralas', 100_000, { settles: true }),
    ];
    expect(setup('2026-10-20', done).filter((t) => t.kind !== 'goal')).toEqual([]);
  });
});

describe('teendők: szélső esetek', () => {
  const ids = (todos: Todo[], kind: Todo['kind']) =>
    todos.filter((t) => t.kind === kind).map((t) => (t.kind === 'bill' || t.kind === 'income' ? t.cat.id : ''));

  it('a tervnél kisebb összeggel vagy 0 Ft-tal lezárt számla és bevétel nem teendő', () => {
    const entries = [
      entry('2026-10', 'aram', 12_000, { settles: true }),
      entry('2026-10', 'net', 0, { settles: true }),
      entry('2026-10', 'tel', 3_000, { settles: true }),
      entry('2026-10', 'fiz', 450_000, { settles: true }),
      entry('2026-10', 'pot', 0, { settles: true }),
    ];
    const todos = setup('2026-10-20', entries);
    expect(ids(todos, 'bill')).toEqual([]);
    expect(ids(todos, 'income')).toEqual([]);
    // Lezárás nélkül ugyanez a részlet még hátralékos teendő.
    expect(ids(setup('2026-10-20', [entry('2026-10', 'aram', 12_000)]), 'bill')).toEqual(['tel', 'aram', 'net']);
  });

  it('az esedékesség határa: 5 nap múlva még teendő, 6 nap múlva még nem', () => {
    // Internet: esedékes okt. 24.
    expect(ids(setup('2026-10-19', base), 'bill')).toContain('net');
    expect(ids(setup('2026-10-18', base), 'bill')).not.toContain('net');
  });

  it('felülírt kezdőnapnál a bevétel a felülírt kezdethez képest a 3. nap után teendő', () => {
    const overrides = [{ periodId: '2026-10', startDate: '2026-10-13' }];
    expect(ids(setup('2026-10-15', base, undefined, overrides), 'income')).toEqual([]);
    expect(ids(setup('2026-10-16', base, undefined, overrides), 'income')).toEqual(['fiz', 'pot']);
  });

  it('a terv nélküli keretből való költés is teendő, a túlfutó keretek után', () => {
    const cats = [...categories, cat('ajandek', 'keret', 0, { name: 'Ajándék' })];
    const todos = setup('2026-10-20', [entry('2026-10', 'ajandek', 80_000)], undefined, [], cats);
    const env = todos.filter((t) => t.kind === 'envelope');
    expect(env.map((t) => sp(todoText(t, '2026-10-20')))).toEqual(['Ajándék: terv nélkül 80 000 Ft']);
    const both = setup('2026-10-20', [...base, entry('2026-10', 'ajandek', 80_000)], undefined, [], cats);
    expect(both.filter((t) => t.kind === 'envelope').map((t) => (t.kind === 'envelope' ? t.env.cat.id : ''))).toEqual(['kaja', 'szabad']);
  });

  it('az időszak első napjaiban a gyorsan fogyó keretnél nincs vetített túllépés', () => {
    const todos = setup('2026-10-11', [entry('2026-10', 'kaja', 50_000)]);
    const env = todos.filter((t) => t.kind === 'envelope');
    expect(env.map((t) => sp(todoText(t, '2026-10-11')))).toEqual(['Élelmiszer: gyorsabban fogy a tervezettnél · eddig a terv 25%-a']);
  });
});

describe('egy kattintásos lezárás szövege', () => {
  it('ugyanaz a Rögzítésen és a teendőknél', () => {
    expect(settleLabel('fix', false)).toBe('Kifizetve');
    expect(settleLabel('bevetel', false)).toBe('Megérkezett');
    expect(settleLabel('megtakaritas', false)).toBe('Félretéve');
    expect(settleLabel('fix', true)).toBe('Maradék');
    expect(sp(settleMessage({ name: 'Áram', type: 'fix' }, 18_000, false))).toBe('Áram: kifizetve 18 000 Ft');
    expect(sp(settleMessage({ name: 'Fizetés', type: 'bevetel' }, 20_000, true))).toBe('Fizetés: maradék 20 000 Ft');
  });
});
