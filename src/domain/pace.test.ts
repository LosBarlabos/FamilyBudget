import { describe, expect, it } from 'vitest';
import { computeSummaries } from './balance';
import { parseImport, buildExport } from './exportFormat';
import {
  article, closingSentence, countsInDaily, dailyAllowance, daysLeftText, envelopeLeftText, envelopePace, envelopeView,
  noDailyPlanText, overspentText, paceOverview, paceSentence, paceStatus, periodDays, perDayAmount, projectedSpend, reserveMonths,
  reserveText, startsInText, unplannedSentence, untilDate,
} from './pace';
import type { BudgetData, Category, Entry } from './types';

const sp = (s: string) => s.replace(/\s/g, ' ');

const cat = (id: string, type: Category['type'], defaultAmount: number, extra: Partial<Category> = {}): Category => ({
  id, name: id, icon: 'dots', color: '#000', type, defaultAmount, order: 0, archived: false, ...extra,
});

let n = 0;
const entry = (periodId: string, categoryId: string, amount: number, extra: Partial<Entry> = {}): Entry => ({
  id: `e${n++}`, periodId, categoryId, amount, date: `${periodId}-15`, createdAt: '2026-01-01T00:00:00Z', ...extra,
});

// Ma: 2026-10-20 → a folyamatban lévő időszak '2026-10' (10.10–11.09., 31 nap): 11 nap eltelt, 21 van hátra.
const TODAY = '2026-10-20';

describe('időszak napjai', () => {
  it('az eltelt és a hátralévő napok is tartalmazzák a mai napot', () => {
    expect(periodDays('2026-10-10', '2026-11-09', TODAY)).toEqual({ total: 31, elapsed: 11, remaining: 21, ratio: 11 / 31 });
    expect(periodDays('2026-10-10', '2026-11-09', '2026-10-10')).toMatchObject({ elapsed: 1, remaining: 31 });
    expect(periodDays('2026-10-10', '2026-11-09', '2026-11-09')).toMatchObject({ elapsed: 31, remaining: 1, ratio: 1 });
  });

  it('lezárt időszakban nincs hátra nap, jövőbeliben nem telt el semmi', () => {
    expect(periodDays('2026-09-10', '2026-10-09', TODAY)).toMatchObject({ elapsed: 30, remaining: 0, ratio: 1 });
    expect(periodDays('2026-11-10', '2026-12-09', TODAY)).toMatchObject({ elapsed: 0, remaining: 30, ratio: 0 });
  });
});

describe('keret tempója', () => {
  it('ok, gyors (a lineárisnál 10%-kal több) és túllépett', () => {
    expect(envelopePace(100_000, 50_000, 0.5)).toBe('ok');
    expect(envelopePace(100_000, 55_000, 0.5)).toBe('ok');
    expect(envelopePace(100_000, 56_000, 0.5)).toBe('fast');
    expect(envelopePace(100_000, 100_000, 0.5)).toBe('fast');
    expect(envelopePace(100_000, 100_001, 0.5)).toBe('over');
    expect(envelopePace(100_000, 100_000, 1)).toBe('ok');
  });

  it('a terv 20%-a alatt az időszak elején sincs figyelmeztetés', () => {
    expect(envelopePace(100_000, 15_000, 0.05)).toBe('ok');
    expect(envelopePace(100_000, 25_000, 0.05)).toBe('fast');
  });

  it('terv nélkül nincs tempó és túllépés sem (nem tervezett kiadás)', () => {
    expect(envelopePace(0, 5_000, 0.5)).toBe('ok');
  });

  it('lineáris tempó szerint várható kiadás', () => {
    expect(projectedSpend(40_000, 0.4)).toBe(100_000);
    expect(projectedSpend(40_000, 1)).toBe(40_000);
    expect(projectedSpend(40_000, 0)).toBe(40_000);
  });
});

describe('napi elkölthető összeg', () => {
  it('a keretek alapból beleszámítanak, a váratlan kiadásoké nem', () => {
    expect(countsInDaily(cat('kaja', 'keret', 0))).toBe(true);
    expect(countsInDaily(cat('v', 'keret', 0, { role: 'unexpected' }))).toBe(false);
    expect(countsInDaily(cat('v', 'keret', 0, { role: 'unexpected', excludeFromDaily: false }))).toBe(true);
    expect(countsInDaily(cat('ruha', 'keret', 0, { excludeFromDaily: true }))).toBe(false);
    expect(countsInDaily(cat('rezsi', 'fix', 0))).toBe(false);
    expect(countsInDaily(cat('fiz', 'bevetel', 0, { incomeMode: 'keret' }))).toBe(false);
  });

  it('a túllépés csökkenti a maradékot, 100 Ft-ra lefelé kerekítve', () => {
    const a = dailyAllowance([{ plan: 200_000, actual: 60_000 }, { plan: 50_000, actual: 62_000 }], 21);
    expect(a).toEqual({ left: 128_000, plan: 250_000, perDay: 6_000 });
  });

  it('összesen túllépve negatív, hátralévő nap nélkül nincs napi összeg', () => {
    expect(dailyAllowance([{ plan: 50_000, actual: 62_000 }], 21)).toEqual({ left: -12_000, plan: 50_000, perDay: -500 });
    expect(dailyAllowance([{ plan: 50_000, actual: 10_000 }], 0).perDay).toBeNull();
    expect(dailyAllowance([], 10)).toEqual({ left: 0, plan: 0, perDay: 0 });
    expect(Object.is(perDayAmount(-50, 10), -0)).toBe(false);
  });
});

describe('áttekintés: keretek állása', () => {
  const categories = [
    cat('fiz', 'bevetel', 500_000),
    cat('kaja', 'keret', 200_000, { name: 'Élelmiszer' }),
    cat('szabad', 'keret', 30_000, { name: 'Szabadidő' }),
    cat('varatlan', 'keret', 20_000, { name: 'Váratlan kiadások', role: 'unexpected' }),
    cat('ruha', 'keret', 20_000, { name: 'Ruházat' }),
    cat('rezsi', 'fix', 50_000),
  ];
  const d: BudgetData = {
    settings: { id: 'settings', payday: 10, openingBalance: 0, firstPeriodId: '2026-09', forecastPeriods: 1, createdAt: '' },
    categories,
    plans: [],
    entries: [
      entry('2026-09', 'kaja', 150_000),
      entry('2026-10', 'kaja', 120_000), entry('2026-10', 'szabad', 35_000), entry('2026-10', 'varatlan', 25_000),
      entry('2026-10', 'ruha', 2_000), entry('2026-10', 'rezsi', 80_000),
    ],
    overrides: [],
  };
  const s = computeSummaries(d, TODAY);
  const o = paceOverview(categories, s.byId.get('2026-10')!, TODAY);

  it('a napi összeg csak a beleszámító keretekből, a túllépéssel csökkentve', () => {
    // kaja 80 000 + szabad −5 000 + ruha 18 000; a váratlan és a fix számla kimarad
    expect(o.allowance.left).toBe(93_000);
    expect(o.allowance.perDay).toBe(4_400);
    expect(o.hasDailyPlan).toBe(true);
  });

  it('tempó csak a napi keretnél, a figyelmeztetések a várható túllépés szerint', () => {
    expect(o.byId.get('kaja')).toMatchObject({ pace: 'fast', marker: 11 / 31, left: 80_000, perDay: 3_800 });
    expect(o.byId.get('szabad')).toMatchObject({ pace: 'over', left: -5_000, perDay: null });
    // A váratlan kiadások nem napi keret: nincs „ma” jelölő és napi összeg, csak a túllépés.
    expect(o.byId.get('varatlan')).toMatchObject({ pace: 'over', marker: null, perDay: null, expectedOver: 5_000 });
    expect(o.byId.get('ruha')!.pace).toBe('ok');
    expect(o.byId.has('rezsi')).toBe(false);
    expect(o.flagged.map((e) => e.cat.id)).toEqual(['kaja', 'szabad', 'varatlan']);
  });

  it('az állapotmondat a leginkább túlfutó keretről szól', () => {
    // 120 000 / (11/31) ≈ 338 182 → ~138 200 Ft túllépés
    expect(sp(paceSentence(o.flagged[0]))).toBe(
      'Az Élelmiszer keret gyorsabban fogy a tervezettnél, ezzel a tempóval ~138 200 Ft-tal lépi túl',
    );
    expect(sp(paceSentence(o.byId.get('szabad')))).toBe('A Szabadidő keret már 5 000 Ft-tal túllépte a tervet');
    expect(paceSentence(null)).toBe('A terv szerint haladtok');
  });

  it('lezárt időszakban nincs tempó és napi összeg', () => {
    const sep = paceOverview(categories, s.byId.get('2026-09')!, TODAY);
    expect(sep.current).toBe(false);
    expect(sep.allowance.perDay).toBeNull();
    expect(sep.byId.get('kaja')).toMatchObject({ pace: 'ok', marker: null, perDay: null, left: 50_000 });
  });

  it('csoportsávnál csak akkor van tempó, ha minden tagja napi keret', () => {
    const days = periodDays('2026-10-10', '2026-11-09', TODAY);
    const fig = { plan: 100_000, actual: 60_000 };
    expect(envelopeView([categories[1], categories[2]], fig, days, true)).toMatchObject({ pace: 'fast', perDay: 1_900 });
    expect(envelopeView([categories[1], categories[3]], fig, days, true)).toMatchObject({ pace: 'ok', marker: null, perDay: null });
    expect(envelopeView([categories[5]], { plan: 50_000, actual: 80_000 }, days, true).pace).toBe('over');
  });
});

describe('áttekintés: terv nélküli és archivált keret', () => {
  const data = (categories: Category[], entries: Entry[]): BudgetData => ({
    settings: { id: 'settings', payday: 10, openingBalance: 0, firstPeriodId: '2026-09', forecastPeriods: 1, createdAt: '' },
    categories, plans: [], entries, overrides: [],
  });
  const overview = (categories: Category[], entries: Entry[], today = TODAY) =>
    paceOverview(categories, computeSummaries(data(categories, entries), today).byId.get('2026-10')!, today);

  it('a terv nélküli költés csökkenti a napi összeget, és az állapotmondat meg is nevezi', () => {
    const categories = [cat('kaja', 'keret', 100_000, { name: 'Élelmiszer' }), cat('ajandek', 'keret', 0, { name: 'Ajándék' })];
    const o = overview(categories, [entry('2026-10', 'kaja', 30_000), entry('2026-10', 'ajandek', 80_000)], '2026-10-25');
    expect(o.allowance.left).toBe(-10_000);
    expect(o.flagged).toEqual([]);
    expect(o.unplanned.map((e) => e.cat.id)).toEqual(['ajandek']);
    const st = paceStatus(o);
    expect(st.tone).toBe('fast');
    expect(sp(st.text)).toBe('Az Ajándék keretből terv nélkül 80 000 Ft-ot költöttetek');
    expect(st.more).toBe(0);
  });

  it('a túlfutó keret előbb áll, a terv nélküli a „még N keret” között', () => {
    const categories = [cat('kaja', 'keret', 100_000, { name: 'Élelmiszer' }), cat('ajandek', 'keret', 0, { name: 'Ajándék' })];
    const o = overview(categories, [entry('2026-10', 'kaja', 110_000), entry('2026-10', 'ajandek', 5_000)]);
    expect(paceStatus(o)).toMatchObject({ tone: 'over', more: 1 });
    expect(sp(unplannedSentence(o.unplanned[0]))).toBe('Az Ajándék keretből terv nélkül 5 000 Ft-ot költöttetek');
  });

  it('napi keretterv nélkül nincs „terv nélküli” figyelmeztetés, és nincs „terv szerint haladtok” sem', () => {
    const categories = [cat('kaja', 'keret', 0, { name: 'Élelmiszer' })];
    const o = overview(categories, [entry('2026-10', 'kaja', 30_000)]);
    expect(o.hasDailyPlan).toBe(false);
    expect(o.unplanned).toEqual([]);
    expect(paceStatus(o)).toEqual({ tone: 'ok', text: 'A terv szerint haladtok', more: 0 });
  });

  it('a folyamatban lévő időszakban archivált keret kimarad a napi összegből', () => {
    // Szabadidő: terv 30 000, tény 10 000, majd archiválva → a terve 0 lesz, de a költése nem túlköltés.
    const categories = [cat('kaja', 'keret', 100_000), cat('szabad', 'keret', 30_000, { name: 'Szabadidő', archived: true })];
    const o = overview(categories, [entry('2026-10', 'szabad', 10_000)]);
    expect(o.allowance).toMatchObject({ left: 100_000, plan: 100_000 });
    expect(o.unplanned).toEqual([]);
    expect(o.flagged).toEqual([]);
  });

  it('a napi összeg hiányának oka', () => {
    const none = overview([cat('kaja', 'keret', 0)], []);
    expect(noDailyPlanText(none)).toBe('ebben az időszakban nincs tervezett keret');
    const excluded = overview([cat('kaja', 'keret', 50_000, { excludeFromDaily: true }), cat('v', 'keret', 20_000, { role: 'unexpected' })], []);
    expect(excluded.hasDailyPlan).toBe(false);
    expect(noDailyPlanText(excluded)).toBe('egyik keret sem számít a napi elkölthető összegbe');
    const unplannedDaily = overview([cat('kaja', 'keret', 0), cat('v', 'keret', 20_000, { role: 'unexpected' })], []);
    expect(noDailyPlanText(unplannedDaily)).toBe('a napi összegbe számító kereteknek nincs terve');
  });
});

describe('áttekintés: az időszak első napjai', () => {
  const categories = [cat('kaja', 'keret', 200_000, { name: 'Élelmiszer' }), cat('szabad', 'keret', 30_000, { name: 'Szabadidő' })];
  const d: BudgetData = {
    settings: { id: 'settings', payday: 10, openingBalance: 0, firstPeriodId: '2026-09', forecastPeriods: 1, createdAt: '' },
    categories, plans: [],
    // Fizetésnapi nagybevásárlás: a keret 25%-a
    entries: [entry('2026-10', 'kaja', 50_000, { date: '2026-10-10' })],
    overrides: [],
  };
  const at = (today: string) => paceOverview(categories, computeSummaries(d, today).byId.get('2026-10')!, today);

  it('az első héten nincs lineáris vetítés, csak az eddig elfogyott arány', () => {
    for (const today of ['2026-10-10', '2026-10-11', '2026-10-15']) {
      const e = at(today).byId.get('kaja')!;
      expect(e.pace).toBe('fast');
      expect(e.projected).toBe(50_000);
      expect(sp(paceSentence(e))).toBe('Az Élelmiszer keret gyorsabban fogy a tervezettnél: eddig 50 000 Ft, a terv 25%-a');
    }
  });

  it('a 7. naptól a tempó szerinti várható túllépés', () => {
    // 50 000 / (7/31) ≈ 221 429 → ~21 400 Ft túllépés
    const e = at('2026-10-16').byId.get('kaja')!;
    expect(e.projected).toBe(221_429);
    expect(sp(paceSentence(e))).toBe('Az Élelmiszer keret gyorsabban fogy a tervezettnél, ezzel a tempóval ~21 400 Ft-tal lépi túl');
  });

  it('az első napokban a túllépett keret áll elöl', () => {
    const o = paceOverview(
      categories,
      computeSummaries({ ...d, entries: [...d.entries, entry('2026-10', 'szabad', 31_000)] }, '2026-10-11').byId.get('2026-10')!,
      '2026-10-11',
    );
    expect(o.flagged.map((e) => e.cat.id)).toEqual(['szabad', 'kaja']);
  });

  it('felülírt kezdőnapú időszak napjai', () => {
    const s = computeSummaries({ ...d, overrides: [{ periodId: '2026-10', startDate: '2026-10-13' }] }, '2026-10-20');
    const p = s.byId.get('2026-10')!;
    expect(p.start).toBe('2026-10-13');
    expect(paceOverview(categories, p, '2026-10-20').days).toEqual({ total: 28, elapsed: 8, remaining: 21, ratio: 8 / 28 });
  });
});

describe('tartalék-mutató', () => {
  const categories = [cat('fiz', 'bevetel', 500_000), cat('kaja', 'keret', 200_000)];
  const d = (entries: Entry[], openingBalance = 100_000): BudgetData => ({
    settings: { id: 'settings', payday: 10, openingBalance, firstPeriodId: '2026-06', forecastPeriods: 1, createdAt: '' },
    categories, plans: [], entries, overrides: [],
  });

  it('az utolsó lezárt időszak végi egyenlege az utolsó 3 lezárt időszak átlagos kiadásához mérve', () => {
    const entries = [
      entry('2026-06', 'kaja', 500_000),
      entry('2026-07', 'fiz', 500_000), entry('2026-07', 'kaja', 100_000),
      entry('2026-08', 'fiz', 500_000), entry('2026-08', 'kaja', 200_000),
      entry('2026-09', 'fiz', 500_000), entry('2026-09', 'kaja', 300_000),
    ];
    // Egyenleg szept. végén: 100 000 − 500 000 + 400 000 + 300 000 + 200 000 = 500 000; átlag (júl–szept.) 200 000
    expect(reserveMonths(computeSummaries(d(entries), TODAY))).toBe(2.5);
  });

  it('lezárt időszak vagy kiadás nélkül nincs mutató', () => {
    expect(reserveMonths(computeSummaries({ ...d([]), settings: { ...d([]).settings, firstPeriodId: '2026-10' } }, TODAY))).toBeNull();
    expect(reserveMonths(computeSummaries(d([]), TODAY))).toBeNull();
  });

  it('szöveg', () => {
    expect(reserveText(1.44)).toBe('≈ 1,4 hónapnyi kiadás');
    expect(reserveText(2)).toBe('≈ 2 hónapnyi kiadás');
    expect(reserveText(12.3)).toBe('≈ 12 hónapnyi kiadás');
    expect(reserveText(-0.5)).toBe('nincs tartalék');
    expect(reserveText(null)).toBeNull();
  });
});

describe('áttekintés szövegei', () => {
  it('névelő', () => {
    expect(article('Élelmiszer')).toBe('Az');
    expect(article('Egészség')).toBe('Az');
    expect(article('Őrség')).toBe('Az');
    expect(article('Szabadidő')).toBe('A');
    expect(article('Gyerekek')).toBe('A');
  });

  it('napok fizetésig', () => {
    expect(untilDate('2026-10-09')).toBe('okt. 9-ig');
    expect(daysLeftText(periodDays('2026-10-10', '2026-11-09', TODAY), '2026-11-09')).toBe('21 nap van fizetésig (nov. 9-ig)');
    expect(daysLeftText(periodDays('2026-10-10', '2026-11-09', '2026-11-09'), '2026-11-09')).toBe('Ma van az időszak utolsó napja');
    expect(startsInText('2026-11-10', TODAY)).toBe('21 nap múlva kezdődik (nov. 10.)');
    expect(startsInText('2026-10-21', TODAY)).toBe('Holnap kezdődik (okt. 21.)');
  });

  it('a keret sora, a túllépés és a zárómondat', () => {
    expect(sp(envelopeLeftText({ left: 27_000, perDay: 2_200 }))).toBe('maradt 27 000 Ft · ~2 200 Ft/nap');
    expect(sp(envelopeLeftText({ left: 27_000, perDay: null }))).toBe('maradt 27 000 Ft');
    expect(sp(envelopeLeftText({ left: -4_000, perDay: null }))).toBe('túllépés 4 000 Ft');
    expect(sp(overspentText(-12_000))).toBe('A keretek összesen 12 000 Ft-tal túl vannak lépve');
    expect(sp(closingSentence(45_000))).toBe('Az időszak +45 000 Ft-tal zárult');
    expect(sp(closingSentence(-12_000))).toBe('Az időszak 12 000 Ft mínusszal zárult');
    expect(closingSentence(0)).toBe('Az időszak nullszaldóval zárult');
  });
});

describe('napi összegen kívüli keret a mentésben', () => {
  it('a jelző megmarad, az érvénytelen érték kimarad', () => {
    const d: BudgetData = {
      settings: { id: 'settings', payday: 10, openingBalance: 0, firstPeriodId: '2026-10', forecastPeriods: 6, createdAt: '2026-10-01T00:00:00Z' },
      categories: [cat('ruha', 'keret', 0, { excludeFromDaily: true }), cat('kaja', 'keret', 0, { excludeFromDaily: 'igen' as unknown as boolean })],
      plans: [],
      entries: [],
      overrides: [],
    };
    const f = parseImport(JSON.stringify(buildExport(d, new Date('2026-10-20T10:00:00Z'))));
    expect(f.categories[0].excludeFromDaily).toBe(true);
    expect('excludeFromDaily' in f.categories[1]).toBe(false);
  });
});
