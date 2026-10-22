import { describe, expect, it } from 'vitest';
import { computeSummaries, openingFromNow, quickFillAmount } from './balance';
import { buildExport, parseImport, rawExport } from './exportFormat';
import { parseSignedAmount } from './money';
import { makeConfig, msUntilNextDay, periodAdjective, periodForName, periodShortLabel, shortDate, startChoice } from './periods';
import { initialPlans, laterPlanChanges, planChangeEffect, planChangeSummary, plansRemovedFrom } from './plans';
import { barPercent } from './status';
import { allowedTypes } from './types';
import type { BudgetData, Category, Entry, Plan } from './types';

const sp = (s: string) => s.replace(/\s/g, ' ');

const cat = (id: string, type: Category['type'], defaultAmount: number, extra: Partial<Category> = {}): Category => ({
  id, name: id, icon: 'dots', color: '#000', type, defaultAmount, order: 0, archived: false, ...extra,
});

let n = 0;
const entry = (periodId: string, categoryId: string, amount: number, extra: Partial<Entry> = {}): Entry => ({
  id: `e${n++}`, periodId, categoryId, amount, date: `${periodId}-15`, createdAt: '2026-01-01T00:00:00Z', ...extra,
});

describe('előjeles összeg', () => {
  it('negatív, nulla és pozitív', () => {
    expect(parseSignedAmount('-25 000')).toBe(-25_000);
    expect(parseSignedAmount('−12e')).toBe(-12_000);
    expect(parseSignedAmount('0')).toBe(0);
    expect(parseSignedAmount('-0')).toBe(0);
    expect(parseSignedAmount('350e')).toBe(350_000);
    expect(parseSignedAmount('')).toBeNull();
    expect(parseSignedAmount('-')).toBeNull();
    expect(parseSignedAmount('abc')).toBeNull();
  });
});

describe('időszak-feliratok', () => {
  it('melléknév, rövid címke és „-ra/-re” alak', () => {
    expect(periodAdjective('2026-12', '2026-11')).toBe('decemberi');
    expect(periodAdjective('2027-01', '2026-11')).toBe('2027. januári');
    expect(periodShortLabel('2026-12', '2026-11')).toBe('dec.');
    expect(periodShortLabel('2027-01', '2026-11')).toBe('2027. jan.');
    expect(periodForName('2026-11')).toBe('novemberre');
    expect(periodForName('2026-03')).toBe('márciusra');
    expect(shortDate('2026-10-05')).toBe('okt. 5.');
  });

  it('éjfélig hátralévő idő', () => {
    expect(msUntilNextDay(new Date(2026, 9, 7, 23, 59, 0))).toBe(60_000);
    expect(msUntilNextDay(new Date(2026, 9, 7, 0, 0, 0))).toBe(86_400_000);
  });
});

describe('első indítás: mivel kezdjünk', () => {
  const cfg = makeConfig(10, []);
  it('ha a mostani időszak több mint fele eltelt, a következő fizetést ajánlja', () => {
    const c = startChoice('2026-10-07', cfg);
    expect(c.currentId).toBe('2026-09');
    expect(c.nextId).toBe('2026-10');
    expect(c.nextStart).toBe('2026-10-10');
    expect(c.suggestNext).toBe(true);
  });

  it('az időszak elején a mostanival kezd', () => {
    const c = startChoice('2026-10-12', cfg);
    expect(c.currentId).toBe('2026-10');
    expect(c.elapsed).toBeCloseTo(2 / 31);
    expect(c.suggestNext).toBe(false);
  });

  it('a következő fizetéssel kezdve a mostani időszak 0-s tervet kap', () => {
    const cats = [cat('kaja', 'keret', 100_000), cat('fiz', 'bevetel', 500_000)];
    expect(initialPlans(cats, '2026-10', '2026-09')).toEqual([
      { periodId: '2026-10', categoryId: 'kaja', amount: 100_000 },
      { periodId: '2026-10', categoryId: 'fiz', amount: 500_000 },
      { periodId: '2026-09', categoryId: 'kaja', amount: 0 },
      { periodId: '2026-09', categoryId: 'fiz', amount: 0 },
    ]);
    expect(initialPlans(cats, '2026-10', '2026-10')).toHaveLength(2);
  });

  it('a mostani időszak 0-s terve miatt csak a tény csökkenti a nyitó egyenleget', () => {
    const cats = [cat('kaja', 'keret', 100_000), cat('fiz', 'bevetel', 500_000)];
    const d: BudgetData = {
      settings: { id: 'settings', payday: 10, openingBalance: 300_000, firstPeriodId: '2026-10', forecastPeriods: 1, createdAt: '' },
      categories: cats,
      plans: initialPlans(cats, '2026-10', '2026-09'),
      entries: [entry('2026-09', 'kaja', 20_000)],
      overrides: [],
    };
    const s = computeSummaries(d, '2026-10-07');
    expect(s.byId.get('2026-09')!.endBalance).toBe(280_000);
    expect(s.byId.get('2026-10')!.endBalance).toBe(680_000);
  });

  it('a nyitó egyenleg a már kifizetett tételekkel visszaszámolva', () => {
    const done = [
      { cat: cat('fiz', 'bevetel', 0), amount: 500_000 },
      { cat: cat('hitel', 'fix', 0), amount: 120_000 },
      { cat: cat('megtak', 'megtakaritas', 0), amount: 30_000 },
    ];
    // Most 410 000 van a számlán: az időszak elején 410 000 − 500 000 + 120 000 + 30 000 = 60 000 volt.
    expect(openingFromNow(410_000, done)).toBe(60_000);
    expect(openingFromNow(-5_000, [])).toBe(-5_000);
  });
});

describe('Tervező: hatály és későbbi tervek', () => {
  const c = cat('kaja', 'keret', 80_000, { name: 'Élelmiszer' });
  const plans: Plan[] = [
    { periodId: '2026-08', categoryId: 'kaja', amount: 80_000 },
    { periodId: '2026-12', categoryId: 'kaja', amount: 150_000 },
    { periodId: '2027-01', categoryId: 'kaja', amount: 80_000 },
    { periodId: '2027-02', categoryId: 'kaja', amount: 80_000 },
  ];

  it('a későbbi egyedi tervek közül csak a változást hozók látszanak', () => {
    expect(laterPlanChanges(plans, c, '2026-11').map((p) => p.periodId)).toEqual(['2026-12', '2027-01']);
    expect(laterPlanChanges(plans, c, '2027-01')).toEqual([]);
  });

  it('„ettől a hónaptól”: a törölt egyedi terv megjelenik a toastban', () => {
    const only = plans.filter((p) => p.periodId !== '2027-01' && p.periodId !== '2027-02');
    expect(sp(planChangeSummary(only, c, '2026-11', 95_000, 'from'))).toBe(
      'Élelmiszer: 95 000 Ft novembertől · a decemberi egyedi terv (150 000 Ft) törölve',
    );
    expect(sp(planChangeSummary(plans, c, '2026-11', 95_000, 'from'))).toBe(
      'Élelmiszer: 95 000 Ft novembertől · 2 későbbi egyedi terv törölve (dec.: 150 000 Ft, 2027. jan.: 80 000 Ft)',
    );
    expect(sp(planChangeSummary(plans, c, '2027-01', 90_000, 'from'))).toBe('Élelmiszer: 90 000 Ft januártól');
  });

  it('a Kategóriák mentése is megnevezi a törölt egyedi terveket', () => {
    const own = plans.filter((p) => p.periodId < '2027-01');
    expect(plansRemovedFrom(own, c, '2026-10', 110_000).map((p) => p.periodId)).toEqual(['2026-12']);
    expect(plansRemovedFrom(own, c, '2026-10', 150_000)).toEqual([]);
    expect(sp(`${c.name} mentve · terv ${planChangeEffect(own, c, '2026-10', 110_000, 'from')}`)).toBe(
      'Élelmiszer mentve · terv 110 000 Ft októbertől · a decemberi egyedi terv (150 000 Ft) törölve',
    );
  });

  it('„csak erre a hónapra”: a következő hónap visszaállása is látszik', () => {
    expect(sp(planChangeSummary(plans, c, '2026-10', 95_000, 'only'))).toBe(
      'Élelmiszer: 95 000 Ft csak októberre · novembertől újra 80 000 Ft',
    );
    expect(sp(planChangeSummary(plans, c, '2026-11', 95_000, 'only'))).toBe('Élelmiszer: 95 000 Ft csak novemberre');
  });
});

describe('gyorskitöltés', () => {
  const cats = [cat('fiz', 'bevetel', 500_000), cat('kaja', 'keret', 100_000), cat('rezsi', 'fix', 50_000), cat('ruha', 'keret', 20_000)];
  const d: BudgetData = {
    settings: { id: 'settings', payday: 10, openingBalance: 0, firstPeriodId: '2026-07', forecastPeriods: 1, createdAt: '' },
    categories: cats,
    plans: [],
    entries: [
      entry('2026-08', 'fiz', 480_000), entry('2026-08', 'kaja', 90_000),
      entry('2026-09', 'kaja', 120_000), entry('2026-09', 'rezsi', 0, { settles: true }),
    ],
    overrides: [],
  };
  const s = computeSummaries(d, '2026-10-20');
  it('csak fix és keret kategóriára, rögzítés nélkül nem ír 0-t', () => {
    expect(quickFillAmount(s, d.entries, cats[1], ['2026-09'])).toBe(120_000);
    expect(quickFillAmount(s, d.entries, cats[1], ['2026-07', '2026-08', '2026-09'])).toBe(70_000);
    expect(quickFillAmount(s, d.entries, cats[0], ['2026-08'])).toBeNull();
    expect(quickFillAmount(s, d.entries, cats[3], ['2026-09'])).toBeNull();
    // A „Nem volt” (0 Ft, lezárva) rögzítés valódi adat: 0 a terv.
    expect(quickFillAmount(s, d.entries, cats[2], ['2026-09'])).toBe(0);
    expect(quickFillAmount(s, d.entries, cats[1], [])).toBeNull();
  });
});

describe('sáv és típusváltás', () => {
  it('a sáv 0 és 100% közé szorul', () => {
    expect(barPercent(-50_000, 100_000)).toBe(0);
    expect(barPercent(50_000, 100_000)).toBe(50);
    expect(barPercent(150_000, 100_000)).toBe(100);
    expect(barPercent(10, 0)).toBe(100);
    expect(barPercent(0, 0)).toBe(0);
    expect(barPercent(10, -5)).toBe(100);
  });

  it('rögzítések mellett csak a fix és a keret között váltható', () => {
    expect(allowedTypes({ type: 'fix' }, true)).toEqual(['fix', 'keret']);
    expect(allowedTypes({ type: 'keret' }, true)).toEqual(['fix', 'keret']);
    expect(allowedTypes({ type: 'bevetel' }, true)).toEqual(['bevetel']);
    expect(allowedTypes({ type: 'megtakaritas' }, false)).toHaveLength(4);
  });
});

describe('vészmentés', () => {
  it('a nyers mentés visszatölthető', () => {
    const d: BudgetData = {
      settings: { id: 'settings', payday: 10, openingBalance: 0, firstPeriodId: '2026-10', forecastPeriods: 6, createdAt: '2026-10-01T00:00:00Z' },
      categories: [cat('kaja', 'keret', 100_000)],
      plans: [{ periodId: '2026-10', categoryId: 'kaja', amount: 100_000 }],
      entries: [entry('2026-10', 'kaja', 5_000)],
      overrides: [],
    };
    const now = new Date('2026-10-20T10:00:00Z');
    const raw = rawExport(d, now);
    expect(raw).toEqual(buildExport(d, now));
    expect(parseImport(JSON.stringify(raw)).entries).toHaveLength(1);
    expect(rawExport({ categories: [], plans: [], entries: [], overrides: [] }, now).settings).toBeNull();
  });

});
