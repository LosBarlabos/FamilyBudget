import { describe, expect, it } from 'vitest';
import {
  deviations, heatPeriods, heatTone, rangePeriods, savingsSpend, searchEntries, shortAmount, spendingRows, tagsOf, tagSummary, trendSeries,
} from './analysis';
import { computeSummaries } from './balance';
import type { BudgetData, Category, Entry } from './types';

const cat = (id: string, type: Category['type'], defaultAmount: number, extra: Partial<Category> = {}): Category => ({
  id, name: id, icon: 'dots', color: '#000', type, defaultAmount, order: 0, archived: false, ...extra,
});
let n = 0;
const entry = (periodId: string, categoryId: string, amount: number, extra: Partial<Entry> = {}): Entry => ({
  id: `e${n++}`, periodId, categoryId, amount, date: `${periodId}-15`, createdAt: `${periodId}-15T10:00:00Z`, ...extra,
});

const categories = [
  cat('kaja', 'keret', 100_000, { name: 'Élelmiszer' }),
  cat('auto', 'keret', 30_000, { name: 'Közlekedés' }),
  cat('aram', 'fix', 15_000, { name: 'Áram' }),
  cat('szabad', 'keret', 0, { name: 'Szabadidő' }),
  cat('fiz', 'bevetel', 500_000, { name: 'Fizetés' }),
  cat('nyaralas', 'megtakaritas', 20_000, { name: 'Nyaralás' }),
];
const entries: Entry[] = [
  // Szeptember (lezárt)
  entry('2026-09', 'kaja', 95_000),
  entry('2026-09', 'auto', 40_000, { note: 'szerviz #autó' }),
  entry('2026-09', 'aram', 15_000, { settles: true }),
  // Október (lezárt)
  entry('2026-10', 'kaja', 120_000, { note: 'szülinap #buli' }),
  entry('2026-10', 'auto', 36_000, { note: 'gumi #Autó', createdBy: 'Partner' }),
  entry('2026-10', 'aram', 15_000, { settles: true }),
  entry('2026-10', 'szabad', 12_000, { note: 'mozi' }),
  entry('2026-10', 'nyaralas', 50_000, { kind: 'withdrawal', spendCategoryId: 'szabad', note: 'repjegy #nyaralás' }),
  // November (folyamatban)
  entry('2026-11', 'kaja', 30_000),
];
const data: BudgetData = {
  settings: { id: 'settings', payday: 10, openingBalance: 0, firstPeriodId: '2026-09', forecastPeriods: 2, createdAt: '2026-09-01T00:00:00Z' },
  categories,
  plans: categories.map((c) => ({ periodId: '2026-09', categoryId: c.id, amount: c.defaultAmount })),
  entries,
  overrides: [],
};
const s = computeSummaries(data, '2026-11-20');
const spend = savingsSpend(entries);

describe('időablak', () => {
  it('a jövő kimarad, az időszak mód csak a választott', () => {
    expect(rangePeriods(s, '2026-11', 'last12').map((p) => p.id)).toEqual(['2026-09', '2026-10', '2026-11']);
    expect(rangePeriods(s, '2026-10', 'period').map((p) => p.id)).toEqual(['2026-10']);
    expect(rangePeriods(s, '2026-12', 'period').map((p) => p.id)).toEqual(['2026-11']);
    expect(rangePeriods(s, '2026-10', 'year').map((p) => p.id)).toEqual(['2026-09', '2026-10', '2026-11']);
    expect(heatPeriods(s, '2026-10', 'period').map((p) => p.id)).toEqual(['2026-09', '2026-10']);
  });
});

describe('hova ment a pénz', () => {
  it('kiadási kategóriánként, költés szerint; a megtakarításból fizetett rész külön', () => {
    const rows = spendingRows(categories, rangePeriods(s, '2026-10', 'period'), spend);
    expect(rows.map((r) => [r.cat.id, r.plan, r.actual, r.fromSavings])).toEqual([
      ['kaja', 100_000, 120_000, 0],
      ['szabad', 0, 12_000, 50_000],
      ['auto', 30_000, 36_000, 0],
      ['aram', 15_000, 15_000, 0],
    ]);
  });
});

describe('eltérések', () => {
  it('csak lezárt időszakokból, a megtakarításból fizetett rész nélkül', () => {
    const d = deviations(categories, rangePeriods(s, '2026-11', 'last12'));
    expect(d.map((x) => [x.cat.id, x.kind, x.diff, x.periodsOver])).toEqual([
      ['auto', 'over', 16_000, 2],
      ['kaja', 'over', 15_000, 1],
      ['szabad', 'unplanned', 12_000, 1],
    ]);
  });

  it('a folyamatban lévő időszakban nincs mihez mérni', () => {
    expect(deviations(categories, rangePeriods(s, '2026-11', 'period'))).toEqual([]);
  });
});

describe('hőtérkép és trend', () => {
  it('tónus az arány szerint', () => {
    expect(heatTone(0, 0, false)).toBe('none');
    expect(heatTone(100, 50, true)).toBe('current');
    expect(heatTone(0, 50, false)).toBe('unplanned');
    expect(heatTone(100, 90, false)).toBe('under');
    expect(heatTone(100, 100, false)).toBe('ok');
    expect(heatTone(100, 115, false)).toBe('over');
    expect(heatTone(100, 116, false)).toBe('way-over');
  });

  it('rövid összeg', () => {
    expect([shortAmount(800), shortAmount(112_400), shortAmount(999_400), shortAmount(1_240_000), shortAmount(2_000_000)]).toEqual([
      '800', '112e', '999e', '1,2M', '2M',
    ]);
  });

  it('trend: tény, terv, 3 havi átlag a lezártakból', () => {
    const t = trendSeries(['kaja'], rangePeriods(s, '2026-11', 'last12'), spend);
    expect(t.map((p) => [p.periodId, p.actual, p.plan, p.avg3, p.current])).toEqual([
      ['2026-09', 95_000, 100_000, 95_000, false],
      ['2026-10', 120_000, 100_000, 107_500, false],
      ['2026-11', 30_000, 100_000, null, true],
    ]);
    expect(trendSeries(['szabad'], rangePeriods(s, '2026-11', 'last12'), spend)[1].fromSavings).toBe(50_000);
  });
});

describe('címkék és kereső', () => {
  it('címkék kisbetűsen, ékezettel, ismétlés nélkül', () => {
    expect(tagsOf('gumi #Autó és #autó, #nyaralás-2027!')).toEqual(['autó', 'nyaralás-2027']);
    expect(tagsOf(undefined)).toEqual([]);
  });

  it('összesítés összeg szerint', () => {
    expect(tagSummary(entries)).toEqual([
      { tag: 'autó', total: 76_000, count: 2 },
      { tag: 'nyaralás', total: 50_000, count: 1 },
      { tag: 'buli', total: 120_000, count: 1 },
    ].sort((a, b) => b.total - a.total));
  });

  it('keresés megjegyzésben, kategórianévben, névben és címkére', () => {
    const ids = (q: string) => searchEntries(entries, categories, q).map((e) => e.note ?? e.categoryId);
    expect(ids('#autó')).toEqual(['gumi #Autó', 'szerviz #autó']);
    expect(ids('MOZI')).toEqual(['mozi']);
    expect(ids('partner')).toEqual(['gumi #Autó']);
    expect(ids('áram').length).toBe(2);
    expect(ids('  ')).toEqual([]);
  });
});
