import { describe, expect, it } from 'vitest';
import { changeSummary, mergeData, sameData, stableStringify } from './sync';
import type { BudgetData, Category, Entry, Plan } from './types';

const settings = {
  id: 'settings' as const, payday: 10, openingBalance: 0, firstPeriodId: '2026-10', forecastPeriods: 6, createdAt: '2026-10-01T00:00:00Z',
};
const cat = (id: string, extra: Partial<Category> = {}): Category => ({
  id, name: id, icon: 'dots', color: '#000', type: 'keret', defaultAmount: 0, order: 0, archived: false, ...extra,
});
const entry = (id: string, amount: number, extra: Partial<Entry> = {}): Entry => ({
  id, periodId: '2026-10', categoryId: 'kaja', amount, date: '2026-10-20', createdAt: '2026-10-20T10:00:00Z', ...extra,
});
const plan = (categoryId: string, amount: number): Plan => ({ periodId: '2026-10', categoryId, amount });
const data = (d: Partial<BudgetData> = {}): BudgetData => ({
  settings, categories: [cat('kaja')], plans: [plan('kaja', 100_000)], entries: [], overrides: [], ...d,
});
const ids = (d: BudgetData) => d.entries.map((e) => e.id).sort();

describe('háromutas összefésülés', () => {
  const base = data({ entries: [entry('a', 1000), entry('b', 2000)] });

  it('mindkét eszköz új rögzítései megmaradnak', () => {
    const local = data({ entries: [...base.entries, entry('l1', 500)] });
    const remote = data({ entries: [...base.entries, entry('r1', 700), entry('r2', 900)] });
    expect(ids(mergeData(base, local, remote))).toEqual(['a', 'b', 'l1', 'r1', 'r2']);
  });

  it('a törlés átjut a másik oldalra', () => {
    const local = data({ entries: [entry('a', 1000)] });
    expect(ids(mergeData(base, local, base))).toEqual(['a']);
    expect(ids(mergeData(base, base, local))).toEqual(['a']);
  });

  it('törlés és módosítás ütközésekor a módosítás marad', () => {
    const local = data({ entries: [entry('a', 1000)] });
    const remote = data({ entries: [entry('a', 1000), entry('b', 2000, { settles: true })] });
    expect(mergeData(base, local, remote).entries.find((e) => e.id === 'b')?.settles).toBe(true);
  });

  it('két eltérő módosításból a helyi nyer, az egyoldalú módosítás átjut', () => {
    const local = data({ entries: [entry('a', 1100), entry('b', 2000)] });
    const remote = data({ entries: [entry('a', 1200), entry('b', 2500)] });
    const m = mergeData(base, local, remote);
    expect(m.entries.map((e) => [e.id, e.amount])).toEqual([['a', 1100], ['b', 2500]]);
  });

  it('a terv időszak és kategória szerint fésülődik', () => {
    const local = data({ plans: [plan('kaja', 120_000)] });
    const remote = data({ plans: [plan('kaja', 100_000), plan('auto', 30_000)], categories: [cat('kaja'), cat('auto')] });
    const m = mergeData(data(), local, remote);
    expect(m.plans).toEqual([plan('kaja', 120_000), plan('auto', 30_000)]);
    expect(m.categories.map((c) => c.id)).toEqual(['kaja', 'auto']);
  });

  it('a beállítások mezőnként fésülődnek, az eszközönkéntiek helyiek maradnak', () => {
    const local = data({ settings: { ...settings, payday: 5, lastSeenPeriodId: '2026-10', lastExportAt: '2026-10-21T00:00:00Z' } });
    const remote = data({ settings: { ...settings, openingBalance: 50_000, lastSeenPeriodId: '2026-09' } });
    const s = mergeData(data(), local, remote).settings;
    expect(s).toMatchObject({ payday: 5, openingBalance: 50_000, lastSeenPeriodId: '2026-10', lastExportAt: '2026-10-21T00:00:00Z' });
  });

  it('alap nélkül mindkét oldal megmarad (eltérésnél a helyi)', () => {
    const local = data({ entries: [entry('a', 1000), entry('x', 1)] });
    const remote = data({ entries: [entry('a', 9999), entry('y', 2)] });
    const m = mergeData(null, local, remote);
    expect(m.entries.map((e) => [e.id, e.amount])).toEqual([['a', 1000], ['x', 1], ['y', 2]]);
  });

  it('változatlan oldalaknál ugyanazt adja vissza', () => {
    expect(sameData(mergeData(base, base, base), base)).toBe(true);
  });
});

describe('összehasonlítás és üzenet', () => {
  it('a kulcssorrend, a rekordsorrend és az undefined mező nem számít', () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: undefined } })).toBe('{"a":{"d":2},"b":1}');
    const a = data({ entries: [entry('a', 1), entry('b', 2)] });
    const b = data({ entries: [entry('b', 2), { ...entry('a', 1), note: undefined }] });
    expect(sameData(a, b)).toBe(true);
    expect(sameData(a, data({ entries: [entry('a', 1)] }))).toBe(false);
  });

  it('az eszközönkénti beállítás eltérése nem változás', () => {
    expect(sameData(data(), data({ settings: { ...settings, lastSeenPeriodId: '2026-11' } }))).toBe(true);
  });

  it('commit üzenet', () => {
    const before = data({ entries: [entry('a', 1), entry('b', 2)] });
    const after = data({ entries: [entry('a', 1), entry('c', 3), entry('d', 4)] });
    expect(changeSummary(before, after, 'Anna')).toBe('Anna: 2 új rögzítés, 1 törölve');
    expect(changeSummary(before, before, 'Anna')).toBe('Anna: módosítás');
    expect(changeSummary(null, after, 'Anna')).toBe('Anna: első feltöltés');
  });
});
