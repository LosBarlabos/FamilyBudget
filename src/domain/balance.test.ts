import { describe, expect, it } from 'vitest';
import { autoPaidPayments, averageActual, changeVsPrevious, changeVsSameDay, computeSummaries, countedAmount, quickFillAmount } from './balance';
import { makeConfig, MAX_PERIOD_RANGE } from './periods';
import { dueBills } from './todos';
import type { BudgetData, Category, Entry } from './types';

const cat = (id: string, type: Category['type'], defaultAmount: number, extra: Partial<Category> = {}): Category => ({
  id, name: id, icon: 'dots', color: '#000', type, defaultAmount, order: 0, archived: false, ...extra,
});

let n = 0;
const entry = (periodId: string, categoryId: string, amount: number, extra: Partial<Entry> = {}): Entry => ({
  id: `e${n++}`, periodId, categoryId, amount, date: `${periodId}-15`, createdAt: '2026-01-01T00:00:00Z', ...extra,
});

function data(entries: Entry[], extra: Partial<BudgetData> = {}): BudgetData {
  return {
    settings: {
      id: 'settings', payday: 10, openingBalance: 100_000, firstPeriodId: '2026-08',
      forecastPeriods: 2, createdAt: '2026-08-10T00:00:00Z',
    },
    categories: [
      cat('fizetes', 'bevetel', 500_000),
      cat('kaja', 'keret', 200_000),
      cat('rezsi', 'fix', 50_000),
      cat('megtak', 'megtakaritas', 100_000),
    ],
    plans: [],
    entries,
    overrides: [],
    ...extra,
  };
}

// Ma: 2026-10-20 → a folyamatban lévő időszak '2026-10' (10.10–11.09.)
const TODAY = '2026-10-20';

describe('futó egyenleg', () => {
  const entries = [
    entry('2026-08', 'fizetes', 500_000), entry('2026-08', 'kaja', 180_000), entry('2026-08', 'rezsi', 50_000), entry('2026-08', 'megtak', 100_000),
    entry('2026-09', 'fizetes', 500_000), entry('2026-09', 'kaja', 220_000), entry('2026-09', 'rezsi', 50_000),
    entry('2026-10', 'fizetes', 500_000), entry('2026-10', 'kaja', 60_000), entry('2026-10', 'rezsi', 70_000),
  ];
  const s = computeSummaries(data(entries), TODAY);

  it('az időszakok az első időszaktól az előrejelzés végéig tartanak', () => {
    expect(s.currentId).toBe('2026-10');
    expect(s.periods.map((p) => p.id)).toEqual(['2026-08', '2026-09', '2026-10', '2026-11', '2026-12']);
    expect(s.periods.map((p) => p.status)).toEqual(['closed', 'closed', 'current', 'future', 'future']);
  });

  it('lezárt időszakban csak a tény számít (a nem rögzített megtakarítás 0)', () => {
    const sep = s.byId.get('2026-09')!;
    expect(sep.expense).toBe(270_000);
    expect(sep.savings).toBe(0);
    expect(sep.net).toBe(230_000);
  });

  it('folyamatban lévő időszakban max(tény, terv) kategóriánként', () => {
    const oct = s.byId.get('2026-10')!;
    // kaja: max(60e, 200e) = 200e; rezsi: max(70e, 50e) = 70e; megtak: 100e
    expect(oct.expense).toBe(270_000);
    expect(oct.savings).toBe(100_000);
    expect(oct.net).toBe(130_000);
  });

  it('jövőbeli időszakban a terv számít, ha nincs nagyobb előre rögzített tény', () => {
    expect(s.byId.get('2026-11')!.net).toBe(500_000 - 250_000 - 100_000);
  });

  it('az egyenleg halmozódik a nyitó egyenlegtől', () => {
    // aug: 500 - 230 - 100 = 170 → 270e; szept: +230 → 500e; okt: +130 → 630e; nov: +150 → 780e
    expect(s.periods.map((p) => p.endBalance)).toEqual([270_000, 500_000, 630_000, 780_000, 930_000]);
    expect(s.periods.map((p) => p.savingsTotal)).toEqual([100_000, 100_000, 200_000, 300_000, 400_000]);
  });

  it('átlag és változás az előző időszakhoz képest', () => {
    expect(averageActual(s, 'kaja', '2026-10')).toBe(200_000);
    expect(averageActual(s, 'kaja', '2026-08')).toBeNull();
    expect(changeVsPrevious(s, 'kaja', '2026-09')).toBe(22);
  });
});

describe('archivált kategória', () => {
  it('a múltbeli ténye számít, a jövőbeli terve nem', () => {
    const d = data([entry('2026-08', 'regi', 30_000)], {});
    d.categories.push(cat('regi', 'keret', 40_000, { archived: true }));
    const s = computeSummaries(d, TODAY);
    expect(s.byId.get('2026-08')!.byCategory.get('regi')?.actual).toBe(30_000);
    expect(s.byId.get('2026-11')!.byCategory.has('regi')).toBe(false);
  });
});

describe('az első időszak előtti mai nap', () => {
  it('ha a fizetésnap módosítása miatt a mai nap az első időszak elé esik, a folyamatban lévő is szerepel', () => {
    // Első időszak: 2026-10 (10-i fizetésnappal indult), a fizetésnap 15-re változott, ma 2026-10-12.
    const d = data([]);
    d.settings = { ...d.settings, payday: 15, firstPeriodId: '2026-10' };
    const s = computeSummaries(d, '2026-10-12');
    expect(s.currentId).toBe('2026-09');
    expect(s.byId.get('2026-09')?.status).toBe('current');
    expect(s.periods[0].id).toBe('2026-09');
    expect(s.periods.at(-1)!.id).toBe('2026-12');
  });

  it('az első időszak előtti időszakban a terv 0, így a fizetés nem számít kétszer', () => {
    // A fizetés okt. 10-én megjött (az első időszakban rögzítve), okt. 12-én a fizetésnap 15-re változott.
    const d = data([entry('2026-10', 'fizetes', 500_000, { date: '2026-10-10' })]);
    d.settings = { ...d.settings, payday: 15, firstPeriodId: '2026-10' };
    d.plans = d.categories.map((c) => ({ periodId: '2026-10', categoryId: c.id, amount: c.defaultAmount }));
    const s = computeSummaries(d, '2026-10-12');
    const sep = s.byId.get('2026-09')!;
    expect(sep.status).toBe('current');
    expect([sep.income, sep.expense, sep.savings]).toEqual([0, 0, 0]);
    expect(sep.byCategory.get('rezsi')!.plan).toBe(0);
    // 100e nyitó + 500e fizetés − 250e kiadás − 100e megtakarítás
    expect(s.byId.get('2026-10')!.endBalance).toBe(250_000);
  });

  it('egy képtelenül régi első időszaknál is szerepel a folyamatban lévő időszak', () => {
    const d = data([]);
    d.settings = { ...d.settings, firstPeriodId: '1900-01' };
    const s = computeSummaries(d, TODAY);
    expect(s.byId.has('2026-10')).toBe(true);
    expect(s.periods).toHaveLength(MAX_PERIOD_RANGE);
    expect(s.periods.at(-1)!.id).toBe('2026-12');
  });
});

describe('lezárt (settles) fix tétel', () => {
  it('a folyamatban lévő időszakban a tervnél kisebb lezárt tény számít, nem a terv', () => {
    const s = computeSummaries(data([entry('2026-10', 'rezsi', 42_000, { settles: true })]), TODAY);
    const f = s.byId.get('2026-10')!.byCategory.get('rezsi')!;
    expect(f).toMatchObject({ plan: 50_000, actual: 42_000, counted: 42_000, settled: true });
  });

  it('lezárás nélkül a részlet mellett a terv számít', () => {
    const s = computeSummaries(data([entry('2026-10', 'rezsi', 42_000)]), TODAY);
    expect(s.byId.get('2026-10')!.byCategory.get('rezsi')).toMatchObject({ counted: 50_000, settled: false });
  });

  it('a 0 Ft-os lezárás („Nem volt”) nullára veszi a tételt', () => {
    const s = computeSummaries(data([entry('2026-11', 'fizetes', 0, { settles: true })]), TODAY);
    expect(s.byId.get('2026-11')!.income).toBe(0);
  });

  it('keretként rögzülő kategóriánál (fix→keret váltás után) a régi lezárás nem számít', () => {
    const d = data([entry('2026-10', 'tel', 8_000, { settles: true }), entry('2026-10', 'tel', 1_000)]);
    d.categories.push(cat('tel', 'keret', 10_000));
    const f = computeSummaries(d, TODAY).byId.get('2026-10')!.byCategory.get('tel')!;
    expect(f).toMatchObject({ actual: 9_000, counted: 10_000, settled: false });
  });

  it('a részletekben érkező bevételnél a lezárás nem számít, az egy összegben érkezőnél igen', () => {
    const d = data([entry('2026-10', 'fizetes', 300_000, { settles: true })]);
    expect(computeSummaries(d, TODAY).byId.get('2026-10')!.income).toBe(300_000);
    d.categories = d.categories.map((c) => (c.id === 'fizetes' ? { ...c, incomeMode: 'keret' as const } : c));
    expect(computeSummaries(d, TODAY).byId.get('2026-10')!.income).toBe(500_000);
  });

  it('a megtakarításból felhasználás nem zár le semmit', () => {
    const s = computeSummaries(data([entry('2026-10', 'megtak', 10_000, { kind: 'withdrawal', settles: true })]), TODAY);
    expect(s.byId.get('2026-10')!.byCategory.get('megtak')!.settled).toBe(false);
  });
});

describe('jövőbe előre rögzített tény', () => {
  it('jövőbeli időszakban is max(tény, terv) számít', () => {
    const s = computeSummaries(data([entry('2026-11', 'kaja', 260_000)]), TODAY);
    expect(s.byId.get('2026-11')!.byCategory.get('kaja')!.counted).toBe(260_000);
    expect(s.byId.get('2026-11')!.expense).toBe(310_000);
  });

  it('a számolt összeg szabályai', () => {
    expect(countedAmount('closed', 100, 80)).toBe(80);
    expect(countedAmount('current', 100, 80)).toBe(100);
    expect(countedAmount('future', 100, 120)).toBe(120);
    expect(countedAmount('future', 100, 80)).toBe(100);
    expect(countedAmount('future', 100, 80, true)).toBe(80);
  });
});

describe('összevetés az előző időszak azonos napjáig', () => {
  const cfg = makeConfig(10, []);
  const at = (periodId: string, date: string, amount: number, extra: Partial<Entry> = {}) =>
    entry(periodId, 'kaja', amount, { date, ...extra });
  const entries = [
    at('2026-09', '2026-09-11', 30_000),
    at('2026-09', '2026-09-20', 40_000),
    at('2026-09', '2026-09-21', 50_000), // ez már a 12. nap után van
    at('2026-10', '2026-10-12', 20_000),
    at('2026-10', '2026-10-19', 25_000),
    at('2026-10', '2026-10-19', 9_000, { kind: 'withdrawal' }),
  ];

  it('az eddigi tényt a múlt havi, ugyanannyiadik napig tartó ténnyel veti össze', () => {
    // okt. 20. az időszak 11. napja (0-tól 10), ennek a szeptemberi párja szept. 20.
    const r = changeVsSameDay(entries, ['kaja'], '2026-10', TODAY, cfg);
    expect(r).toEqual({ current: 45_000, previous: 70_000, pct: -36 });
  });

  it('ha az előző időszakban addig nem volt tény, nincs százalék', () => {
    const r = changeVsSameDay(entries, ['kaja'], '2026-10', '2026-10-10', cfg);
    expect(r.previous).toBe(0);
    expect(r.pct).toBeNull();
  });

  it('a rövidebb előző időszak végénél megáll', () => {
    const cfg31 = makeConfig(31, []);
    // 31-i fizetésnapnál a januári időszak jan. 31-től febr. 27-ig tart, így a februári időszak márc. 29-i
    // napjának nincs párja: a januári időszak végéig számol.
    const e = [entry('2026-01', 'kaja', 10_000, { date: '2026-02-27' }), entry('2026-02', 'kaja', 5_000, { date: '2026-03-01' })];
    const r = changeVsSameDay(e, ['kaja'], '2026-02', '2026-03-29', cfg31);
    expect(r.previous).toBe(10_000);
  });
});

describe('csoportos beszedés (automatikusan kifizetett számla)', () => {
  // A rezsi 15-én esedékes, szeptembertől csoportos beszedéssel.
  const auto = (entries: Entry[], extra: Partial<Category> = {}) =>
    data(entries, {
      categories: [cat('fizetes', 'bevetel', 500_000), cat('rezsi', 'fix', 50_000, { dueDay: 15, autoPayFrom: '2026-09', ...extra })],
    });
  const fig = (d: BudgetData, periodId: string, today = TODAY) => computeSummaries(d, today).byId.get(periodId)!.byCategory.get('rezsi')!;

  it('az esedékességtől rögzítés nélkül kifizetett a terv összegével', () => {
    expect(fig(auto([]), '2026-09')).toEqual({ plan: 50_000, actual: 50_000, counted: 50_000, settled: true, auto: true });
    expect(fig(auto([]), '2026-10')).toMatchObject({ actual: 50_000, settled: true, auto: true });
  });

  it('az esedékesség előtt még nyitott, de a terv már számít', () => {
    expect(fig(auto([]), '2026-10', '2026-10-14')).toEqual({ plan: 50_000, actual: 0, counted: 50_000, settled: false });
  });

  it('a bekapcsolás előtti időszakot nem érinti', () => {
    expect(fig(auto([]), '2026-08')).toEqual({ plan: 50_000, actual: 0, counted: 0, settled: false });
  });

  it('a lezárt időszak egyenlegében is kifizetettként szerepel', () => {
    const s = computeSummaries(auto([]), TODAY);
    expect(s.byId.get('2026-09')!.expense).toBe(50_000);
  });

  it('a kézi rögzítés felülírja („Nem volt”, „Más összeg”, részlet)', () => {
    expect(fig(auto([entry('2026-10', 'rezsi', 0, { settles: true })]), '2026-10')).toEqual({ plan: 50_000, actual: 0, counted: 0, settled: true });
    expect(fig(auto([entry('2026-10', 'rezsi', 47_000, { settles: true })]), '2026-10')).toMatchObject({ actual: 47_000, settled: true });
    expect(fig(auto([entry('2026-10', 'rezsi', 20_000)]), '2026-10')).toEqual({ plan: 50_000, actual: 20_000, counted: 50_000, settled: false });
  });

  it('esedékességi nap vagy terv nélkül nincs automatikus fizetés', () => {
    expect(fig(auto([], { dueDay: undefined }), '2026-10').auto).toBeUndefined();
    expect(fig(auto([], { defaultAmount: 0 }), '2026-10').auto).toBeUndefined();
  });

  it('csak fix számlánál érvényes', () => {
    const d = data([], { categories: [cat('rezsi', 'keret', 50_000, { dueDay: 15, autoPayFrom: '2026-09' })] });
    expect(fig(d, '2026-10').auto).toBeUndefined();
  });

  it('az automatikusan kifizetett számla nem teendő', () => {
    const d = auto([]);
    const p = computeSummaries(d, TODAY).byId.get('2026-10')!;
    expect(dueBills(d.categories, p, TODAY)).toEqual([]);
    const before = computeSummaries(d, '2026-10-12').byId.get('2026-10')!;
    expect(dueBills(d.categories, before, '2026-10-12').map((b) => b.cat.id)).toEqual(['rezsi']);
  });

  it('kikapcsoláskor a rögzítés nélküli fizetések listája az esedékesség napjával', () => {
    const d = auto([entry('2026-10', 'rezsi', 0, { settles: true })]);
    const s = computeSummaries(d, TODAY);
    expect(autoPaidPayments(s, d.categories[1])).toEqual([{ periodId: '2026-09', amount: 50_000, date: '2026-09-15' }]);
  });
});

describe('negyedéves számla', () => {
  // Biztosítás: negyedévente, novembertől (aug., nov., febr. …), alkalmanként 45 000 Ft.
  const d = (entries: Entry[] = []) =>
    data(entries, { categories: [cat('fizetes', 'bevetel', 500_000), cat('biztositas', 'fix', 45_000, { cycleMonths: 3, cycleStart: '2026-11' })] });
  const plans = (s: ReturnType<typeof computeSummaries>) => s.periods.map((p) => `${p.id}:${p.byCategory.get('biztositas')?.plan}`);

  it('csak az esedékes időszakokban van terve, és csak ott csökkenti az egyenleget', () => {
    const s = computeSummaries(d(), TODAY);
    expect(plans(s)).toEqual(['2026-08:45000', '2026-09:0', '2026-10:0', '2026-11:45000', '2026-12:0']);
    expect(s.byId.get('2026-11')!.expense).toBe(45_000);
    expect(s.byId.get('2026-12')!.expense).toBe(0);
  });

  it('a köztes hónapban rögzített tény is számít', () => {
    expect(computeSummaries(d([entry('2026-10', 'biztositas', 12_000)]), TODAY).byId.get('2026-10')!.expense).toBe(12_000);
  });

  it('a gyors kitöltés nem írja át a havi tények alapján', () => {
    const dd = d([entry('2026-09', 'biztositas', 45_000)]);
    expect(quickFillAmount(computeSummaries(dd, TODAY), dd.entries, dd.categories[1], ['2026-09'])).toBeNull();
  });
});
