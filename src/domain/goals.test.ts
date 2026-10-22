import { describe, expect, it } from 'vitest';
import { computeSummaries } from './balance';
import { goalProgress, goalSummary, requiredPlan } from './goals';
import { applyPlanOps, planChangeOps } from './plans';
import type { BudgetData, Category, Entry, Plan } from './types';

const goal = (extra: Partial<Category> = {}): Category => ({
  id: 'g', name: 'Nyaralás', icon: 'beach', color: '#000', type: 'megtakaritas',
  defaultAmount: 50_000, order: 0, archived: false, goalAmount: 400_000, ...extra,
});

let n = 0;
const dep = (periodId: string, amount: number, kind?: 'withdrawal', settles?: true): Entry => ({
  id: `e${n++}`, periodId, categoryId: 'g', amount, date: `${periodId}-15`, createdAt: '', kind, settles,
});

const run = (cat: Category, entries: Entry[], plans: Plan[] = [], current = '2026-10') =>
  goalProgress(cat, { entries, plans }, current);

describe('megtakarítási cél', () => {
  it('cél nélkül csak az összegyűlt összeget számolja', () => {
    const g = run(goal({ goalAmount: undefined, goalStart: 10_000 }), [dep('2026-09', 50_000), dep('2026-10', 30_000, 'withdrawal')]);
    expect(g.state).toBe('noTarget');
    expect(g.saved).toBe(30_000);
    expect(g.target).toBeNull();
  });

  it('egyenleg: induló összeg + befizetések − felhasználás', () => {
    const g = run(goal({ goalStart: 100_000 }), [dep('2026-08', 50_000), dep('2026-09', 50_000), dep('2026-09', 20_000, 'withdrawal')]);
    expect(g.saved).toBe(180_000);
    expect(g.deposited).toBe(100_000);
    expect(g.withdrawn).toBe(20_000);
    expect(g.remaining).toBe(220_000);
    expect(g.pct).toBe(45);
  });

  it('a terv alapján előrejelzi, mikor gyűlik össze', () => {
    // 200e megvan; okt: még 50e várható, nov, dec, jan: 50e → jan végére 400e
    const g = run(goal({ goalStart: 200_000 }), []);
    expect(g.projected).toBe('2027-01');
    expect(g.state).toBe('onTrack');
  });

  it('a folyamatban lévő időszak már befizetett része nem számít kétszer', () => {
    const g = run(goal({ goalStart: 200_000 }), [dep('2026-10', 50_000)]);
    // 250e megvan; okt: terv teljesült; nov, dec, jan → 400e
    expect(g.projected).toBe('2027-01');
  });

  it('határidővel: szükséges havi összeg és lemaradás', () => {
    const g = run(goal({ goalStart: 100_000, goalDeadline: '2026-12' }), []);
    // okt, nov, dec = 3 időszak, 300e hiányzik → 100e/hó; a 50e-s tervvel 2027-03-ra lesz meg
    expect(g.periodsLeft).toBe(3);
    expect(g.requiredMonthly).toBe(100_000);
    expect(g.projected).toBe('2027-03');
    expect(g.state).toBe('behind');
  });

  it('a szükséges havi összeg ezresre felfelé kerekít', () => {
    const g = run(goal({ goalAmount: 100_000, goalDeadline: '2026-12' }), []);
    expect(g.requiredMonthly).toBe(34_000);
  });

  it('a szükséges összeg a mostani időszak befizetését is a terv részének veszi', () => {
    // 250e megvan (ebből 50e októberben), 150e hiányzik, okt–dec: (150e + 50e) / 3 → 67e
    const cat = goal({ goalStart: 200_000, goalDeadline: '2026-12' });
    const entries = [dep('2026-10', 50_000)];
    const g = run(cat, entries);
    expect(g.requiredMonthly).toBe(67_000);
    expect(g.state).toBe('behind');
  });

  it('a javasolt összeget „ettől a hónaptól” tervként beállítva a cél időben összejön', () => {
    const cat = goal({ goalStart: 200_000, goalDeadline: '2026-12' });
    const entries = [dep('2026-10', 50_000)];
    const required = run(cat, entries).requiredMonthly!;
    const plans = applyPlanOps([], planChangeOps([], cat, '2026-10', required, 'from'));
    const g = run(cat, entries, plans);
    expect(g.state).toBe('onTrack');
    expect(g.projected! <= '2026-12').toBe(true);
  });

  it('ha a mostani befizetés lezárult, a hiányzó a hátralévő időszakokra oszlik', () => {
    // 250e megvan, 150e hiányzik; október lezárva, nov–dec: 75e
    const cat = goal({ goalStart: 200_000, goalDeadline: '2026-12' });
    const entries = [dep('2026-10', 50_000, undefined, true)];
    const g = run(cat, entries);
    expect(g.requiredMonthly).toBe(75_000);
    const plans = applyPlanOps([], planChangeOps([], cat, '2026-10', 75_000, 'from'));
    expect(run(cat, entries, plans).state).toBe('onTrack');
  });

  it('a jövőbe előre rögzített (lezárt) befizetésű időszak kimarad, a hiányzó a többire oszlik', () => {
    // 120e cél, 30e decemberre előre félretéve: okt–nov 90e → 45e
    const cat = goal({ goalAmount: 120_000, defaultAmount: 0, goalDeadline: '2026-12' });
    const entries = [dep('2026-12', 30_000, undefined, true)];
    const g = run(cat, entries);
    expect(g.requiredMonthly).toBe(45_000);
    const plans = applyPlanOps([], planChangeOps([], cat, '2026-10', g.requiredMonthly!, 'from'));
    expect(run(cat, entries, plans).state).toBe('onTrack');
  });

  it('a jövőbe előre rögzített, nyitott befizetés a terv része', () => {
    // okt–dec: (90e hiányzó + 30e decemberi befizetés) / 3 → 40e; decemberben a terv még 10e-et hoz
    const cat = goal({ goalAmount: 120_000, defaultAmount: 0, goalDeadline: '2026-12' });
    const entries = [dep('2026-12', 30_000)];
    const g = run(cat, entries);
    expect(g.requiredMonthly).toBe(40_000);
    const plans = applyPlanOps([], planChangeOps([], cat, '2026-10', g.requiredMonthly!, 'from'));
    const after = run(cat, entries, plans);
    expect(after.state).toBe('onTrack');
    expect(after.projected).toBe('2026-12');
  });

  it('a havi összegnél nagyobb befizetésű időszak nem hoz többet', () => {
    // 60e hiányzik, októberben már 200e ment be: nov–dec 30e elég, október nem ad hozzá
    expect(requiredPlan(60_000, [200_000, 0, 0])).toBe(30_000);
    expect(requiredPlan(60_000, [])).toBeNull();
    expect(requiredPlan(0, [0, 0])).toBeNull();
  });

  it('ha a határidő a mostani időszak, és a befizetése lezárult, nem ír „havi 0 Ft”-ot', () => {
    const cat = goal({ goalStart: 330_000, goalDeadline: '2026-10' });
    const g = run(cat, [dep('2026-10', 50_000, undefined, true)]);
    expect(g.periodsLeft).toBe(1);
    expect(g.requiredMonthly).toBeNull();
    expect(g.state).toBe('behind');
    const text = goalSummary(g).replace(/\s/g, ' ');
    expect(text).toContain('a határidőig már nem gyűlik össze');
    expect(text).not.toContain('havi');
  });

  it('az összegzés kimondja a szükséges havi összeget és a lejárt határidőt', () => {
    expect(goalSummary(run(goal({ goalStart: 100_000, goalDeadline: '2026-12' }), [])).replace(/\s/g, ' ')).toBe(
      'még 300 000 Ft · határidő 2026. dec. · havi 100 000 Ft kell · a mostani tervvel 2027. már.',
    );
    expect(goalSummary(run(goal({ goalDeadline: '2026-08' }), []))).toContain('a határidő (2026. aug.) lejárt');
  });

  it('az első időszak előtti időszakban külön terv nélkül nem gyűlik semmi', () => {
    // A fizetésnap módosítása miatt a mostani (szeptember) az első időszak (október) elé esik.
    const cat = goal({ goalStart: 200_000 });
    const plans = [{ periodId: '2026-10', categoryId: 'g', amount: 50_000 }];
    const g = goalProgress(cat, { entries: [], plans, settings: { firstPeriodId: '2026-10' } }, '2026-09');
    // szept: 0; okt, nov, dec, jan: 50e → jan végére 400e
    expect(g.projected).toBe('2027-01');
  });

  it('a lezárt időszakban a terv maradéka már nem gyűlik', () => {
    // 200e + 20e (lezárva), terv 50e: október nem ad többet; nov, dec, jan, febr → 420e
    const g = run(goal({ goalStart: 200_000 }), [dep('2026-10', 20_000, undefined, true)]);
    expect(g.projected).toBe('2027-02');
  });

  it('terv nélkül nem jön össze', () => {
    const g = run(goal({ defaultAmount: 0 }), []);
    expect(g.projected).toBeNull();
    expect(g.state).toBe('noPlan');
  });

  it('a tervmódosítás az előrejelzést is módosítja', () => {
    const g = run(goal(), [], [{ periodId: '2026-11', categoryId: 'g', amount: 150_000 }]);
    // okt 50e, nov 150e, dec 150e, jan 150e → jan végére 500e ≥ 400e; dec végén 350e
    expect(g.projected).toBe('2027-01');
  });

  it('elért cél', () => {
    const g = run(goal({ goalStart: 400_000 }), []);
    expect(g.state).toBe('reached');
    expect(g.pct).toBe(100);
    expect(g.requiredMonthly).toBeNull();
  });
});

describe('felhasználás a futó egyenlegben', () => {
  it('a megtakarításból elköltött összeg nem változtat a futó egyenlegen', () => {
    const data: BudgetData = {
      settings: { id: 'settings', payday: 10, openingBalance: 0, firstPeriodId: '2026-09', forecastPeriods: 1, createdAt: '' },
      categories: [goal()],
      plans: [],
      entries: [dep('2026-09', 50_000)],
      overrides: [],
    };
    const before = computeSummaries(data, '2026-10-20').byId.get('2026-09')!.endBalance;
    data.entries.push(dep('2026-09', 30_000, 'withdrawal'));
    const s = computeSummaries(data, '2026-10-20');
    expect(s.byId.get('2026-09')!.endBalance).toBe(before);
    expect(s.byId.get('2026-09')!.byCategory.get('g')!.actual).toBe(50_000);
  });
});
