import { describe, expect, it } from 'vitest';
import {
  applyPlanOps, cycleOf, effectivePlan, indexPlans, isDuePeriod, missingBasePlans, newCategoryPlans, nextDuePeriod, planChangeOps, planChangeSummary,
  planStartId, restartPlanOps, scheduledPlan,
} from './plans';
import type { Category, Plan } from './types';

const cat: Category = {
  id: 'c1', name: 'Élelmiszer', icon: 'shopping-cart', color: '#000', type: 'keret',
  defaultAmount: 100_000, order: 0, archived: false,
};

const eff = (plans: Plan[], p: string) => effectivePlan(indexPlans(plans), cat, p);

describe('terv öröklődése', () => {
  it('rekord nélkül az alapértelmezett összeg', () => {
    expect(eff([], '2026-10')).toBe(100_000);
  });

  it('a legközelebbi korábbi rekord öröklődik', () => {
    const plans: Plan[] = [
      { periodId: '2026-08', categoryId: 'c1', amount: 120_000 },
      { periodId: '2026-11', categoryId: 'c1', amount: 150_000 },
    ];
    expect(eff(plans, '2026-07')).toBe(100_000);
    expect(eff(plans, '2026-08')).toBe(120_000);
    expect(eff(plans, '2026-10')).toBe(120_000);
    expect(eff(plans, '2027-03')).toBe(150_000);
  });

  it('más kategória rekordja nem számít', () => {
    expect(eff([{ periodId: '2026-08', categoryId: 'x', amount: 1 }], '2026-10')).toBe(100_000);
  });

  it('az első időszak előtt külön terv nélkül 0, nem az alapösszeg', () => {
    const plans: Plan[] = [{ periodId: '2026-10', categoryId: 'c1', amount: 120_000 }];
    expect(effectivePlan(indexPlans(plans), cat, '2026-09', '2026-10')).toBe(0);
    expect(effectivePlan(indexPlans(plans), cat, '2026-10', '2026-10')).toBe(120_000);
    // A külön (pl. a Tervezőben megadott) terv ott is számít.
    const own: Plan[] = [...plans, { periodId: '2026-09', categoryId: 'c1', amount: 30_000 }];
    expect(effectivePlan(indexPlans(own), cat, '2026-09', '2026-10')).toBe(30_000);
  });
});

describe('terv módosítása', () => {
  const plans: Plan[] = [
    { periodId: '2026-08', categoryId: 'c1', amount: 120_000 },
    { periodId: '2026-12', categoryId: 'c1', amount: 150_000 },
  ];

  it('„ettől a hónaptól”: a későbbi felülírások törlődnek', () => {
    const next = applyPlanOps(plans, planChangeOps(plans, cat, '2026-10', 90_000, 'from'));
    expect(eff(next, '2026-09')).toBe(120_000);
    expect(eff(next, '2026-10')).toBe(90_000);
    expect(eff(next, '2027-02')).toBe(90_000);
  });

  it('„csak erre a hónapra”: a következő hónap megtartja a korábbi értéket', () => {
    const next = applyPlanOps(plans, planChangeOps(plans, cat, '2026-10', 200_000, 'only'));
    expect(eff(next, '2026-09')).toBe(120_000);
    expect(eff(next, '2026-10')).toBe(200_000);
    expect(eff(next, '2026-11')).toBe(120_000);
    expect(eff(next, '2026-12')).toBe(150_000);
  });

  it('„csak erre”: ha a következő hónapnak már van saját terve, azt nem írja felül', () => {
    const next = applyPlanOps(plans, planChangeOps(plans, cat, '2026-11', 200_000, 'only'));
    expect(eff(next, '2026-11')).toBe(200_000);
    expect(eff(next, '2026-12')).toBe(150_000);
  });

  it('meglévő rekordot felülír, nem duplikál', () => {
    const next = applyPlanOps(plans, planChangeOps(plans, cat, '2026-08', 130_000, 'from'));
    expect(next.filter((p) => p.periodId === '2026-08')).toHaveLength(1);
    expect(eff(next, '2026-08')).toBe(130_000);
  });
});

describe('alapértelmezett összeg mint sablon', () => {
  const other: Category = { ...cat, id: 'c2', defaultAmount: 30_000 };

  it('a tervrekord nélküli kategória az első időszakra kap rekordot az alapösszeggel', () => {
    const plans: Plan[] = [{ periodId: '2026-08', categoryId: 'c1', amount: 120_000 }];
    expect(missingBasePlans([cat, other], plans, '2026-08')).toEqual([{ periodId: '2026-08', categoryId: 'c2', amount: 30_000 }]);
  });

  it('csak későbbi rekord nem elég: az első időszakra is kell egy', () => {
    const plans: Plan[] = [{ periodId: '2026-10', categoryId: 'c1', amount: 120_000 }];
    expect(missingBasePlans([cat], plans, '2026-08')).toEqual([{ periodId: '2026-08', categoryId: 'c1', amount: 100_000 }]);
  });

  it('idempotens', () => {
    const first = missingBasePlans([cat, other], [], '2026-08');
    expect(missingBasePlans([cat, other], first, '2026-08')).toEqual([]);
  });

  it('a migráció után az alapösszeg módosítása nem írja át a múltat', () => {
    const plans = missingBasePlans([cat], [], '2026-08');
    const changed = { ...cat, defaultAmount: 150_000 };
    expect(eff(plans, '2026-09')).toBe(100_000);
    expect(effectivePlan(indexPlans(plans), changed, '2026-09')).toBe(100_000);
    const next = applyPlanOps(plans, planChangeOps(plans, changed, '2026-10', 150_000, 'from'));
    expect(eff(next, '2026-09')).toBe(100_000);
    expect(eff(next, '2026-10')).toBe(150_000);
  });

  it('új kategória a mostani időszaktól kapja az alapösszegét, a múltban 0', () => {
    const plans = newCategoryPlans(cat, '2026-08', '2026-10');
    expect(plans).toEqual([
      { periodId: '2026-08', categoryId: 'c1', amount: 0 },
      { periodId: '2026-10', categoryId: 'c1', amount: 100_000 },
    ]);
    expect(eff(plans, '2026-09')).toBe(0);
    expect(eff(plans, '2027-01')).toBe(100_000);
    expect(missingBasePlans([cat], plans, '2026-08')).toEqual([]);
  });

  it('ha a mostani az első időszak, egyetlen rekord elég', () => {
    expect(newCategoryPlans(cat, '2026-10', '2026-10')).toEqual([{ periodId: '2026-10', categoryId: 'c1', amount: 100_000 }]);
  });

  it('ha a költségvetés még nem indult el, az új kategória az első időszaktól kap tervet', () => {
    expect(planStartId('2026-09', '2026-10')).toBe('2026-10');
    expect(planStartId('2026-11', '2026-10')).toBe('2026-11');
    const plans = newCategoryPlans(cat, '2026-10', '2026-09');
    expect(plans).toEqual([{ periodId: '2026-10', categoryId: 'c1', amount: 100_000 }]);
    expect(effectivePlan(indexPlans(plans), cat, '2026-09', '2026-10')).toBe(0);
  });
});

describe('újraindítás a következő hónaptól', () => {
  const other: Category = { ...cat, id: 'c2', defaultAmount: 30_000 };

  it('az ott érvényes terv lesz az új alapterv, a korábbi rekordok törlődnek, a későbbiek maradnak', () => {
    const plans: Plan[] = [
      { periodId: '2026-10', categoryId: 'c1', amount: 120_000 },
      { periodId: '2026-10', categoryId: 'c2', amount: 30_000 },
      { periodId: '2027-01', categoryId: 'c2', amount: 35_000 },
    ];
    const ops = restartPlanOps([cat, other], plans, '2026-10', '2026-11');
    expect(ops.put).toEqual([
      { periodId: '2026-11', categoryId: 'c1', amount: 120_000 },
      { periodId: '2026-11', categoryId: 'c2', amount: 30_000 },
    ]);
    const next = applyPlanOps(plans, ops);
    const idx = indexPlans(next);
    // Az új első időszak előtt 0 a terv, onnan a megtervezett összeg, a későbbi egyedi terv is megmarad.
    expect(effectivePlan(idx, cat, '2026-10', '2026-11')).toBe(0);
    expect(effectivePlan(idx, cat, '2026-11', '2026-11')).toBe(120_000);
    expect(effectivePlan(idx, other, '2027-01', '2026-11')).toBe(35_000);
    expect(missingBasePlans([cat, other], next, '2026-11')).toEqual([]);
  });

  it('a már megadott novemberi terv számít, nem az októberi', () => {
    const plans: Plan[] = [
      { periodId: '2026-10', categoryId: 'c1', amount: 120_000 },
      { periodId: '2026-11', categoryId: 'c1', amount: 90_000 },
    ];
    const next = applyPlanOps(plans, restartPlanOps([cat], plans, '2026-10', '2026-11'));
    expect(next).toEqual([{ periodId: '2026-11', categoryId: 'c1', amount: 90_000 }]);
  });
});

describe('nem havonta esedékes számla', () => {
  const q: Category = { ...cat, id: 'q', type: 'fix', defaultAmount: 45_000, cycleMonths: 3, cycleStart: '2026-11' };

  it('a ciklus kezdetétől minden n-edik időszakban esedékes, visszafelé is', () => {
    const due = ['2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02'].filter((p) => isDuePeriod(q, p));
    expect(due).toEqual(['2026-08', '2026-11', '2027-02']);
  });

  it('a következő esedékes időszak (az adott időszakot is beleértve)', () => {
    expect(nextDuePeriod(q, '2026-10')).toBe('2026-11');
    expect(nextDuePeriod(q, '2026-11')).toBe('2026-11');
    expect(nextDuePeriod(q, '2026-12')).toBe('2027-02');
  });

  it('a köztes hónapban 0 a terv, az esedékesben az alkalmankénti összeg', () => {
    const idx = indexPlans([{ periodId: '2026-09', categoryId: 'q', amount: 45_000 }, { periodId: '2027-01', categoryId: 'q', amount: 48_000 }]);
    expect(scheduledPlan(idx, q, '2026-10')).toBe(0);
    expect(scheduledPlan(idx, q, '2026-11')).toBe(45_000);
    // A köztes hónapban rögzített új összeg a következő esedékességtől látszik.
    expect(scheduledPlan(idx, q, '2027-01')).toBe(0);
    expect(scheduledPlan(idx, q, '2027-02')).toBe(48_000);
  });

  it('havonta, ha nem fix számla vagy hiányos a beállítás', () => {
    expect(cycleOf(q)).toBe(3);
    expect(cycleOf({ ...q, type: 'keret' })).toBe(1);
    expect(cycleOf({ ...q, cycleStart: undefined })).toBe(1);
    expect(cycleOf({ ...q, cycleMonths: 5 })).toBe(1);
    expect(isDuePeriod({ ...q, type: 'keret' }, '2026-10')).toBe(true);
  });
});

describe('tervmódosítás összegzése', () => {
  const base: Plan = { periodId: '2026-01', categoryId: 'c1', amount: 100_000 };
  const sp = (t: string) => t.replace(/\s/g, ' ');

  it('magánhangzós hónap előtt „az” a névelő', () => {
    const plans = [base, { periodId: '2026-10', categoryId: 'c1', amount: 150_000 }];
    expect(sp(planChangeSummary(plans, cat, '2026-09', 95_000, 'from'))).toBe('Élelmiszer: 95 000 Ft szeptembertől · az októberi egyedi terv (150 000 Ft) törölve');
  });

  it('mássalhangzós hónap előtt „a” a névelő', () => {
    const plans = [base, { periodId: '2026-12', categoryId: 'c1', amount: 150_000 }];
    expect(sp(planChangeSummary(plans, cat, '2026-11', 95_000, 'from'))).toContain('· a decemberi egyedi terv');
  });
});
