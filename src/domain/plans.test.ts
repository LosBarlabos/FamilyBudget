import { describe, expect, it } from 'vitest';
import { applyPlanOps, effectivePlan, indexPlans, missingBasePlans, newCategoryPlans, planChangeOps, planStartId } from './plans';
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
