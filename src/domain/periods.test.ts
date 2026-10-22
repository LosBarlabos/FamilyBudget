import { describe, expect, it } from 'vitest';
import {
  clampToPeriod, defaultStart, formatRange, invalidOverrides, makeConfig, MAX_PERIOD_RANGE, periodDistance, periodEnd, periodForDate,
  periodFromName, periodRange, periodStart, periodStatus, shiftPeriod, validateOverride,
} from './periods';

const cfg10 = makeConfig(10, []);

describe('időszakhatárok', () => {
  it('a fizetésnaptól a következő fizetésnap előtti napig tart', () => {
    expect(periodStart('2026-10', cfg10)).toBe('2026-10-10');
    expect(periodEnd('2026-10', cfg10)).toBe('2026-11-09');
  });

  it('rövidebb hónapban a hónap utolsó napján kezdődik', () => {
    expect(defaultStart('2026-02', 31)).toBe('2026-02-28');
    expect(defaultStart('2028-02', 30)).toBe('2028-02-29');
    const cfg31 = makeConfig(31, []);
    expect(periodEnd('2026-01', cfg31)).toBe('2026-02-27');
    expect(periodStart('2026-02', cfg31)).toBe('2026-02-28');
  });

  it('évhatáron is helyesen lép', () => {
    expect(shiftPeriod('2026-12', 1)).toBe('2027-01');
    expect(shiftPeriod('2026-01', -1)).toBe('2025-12');
    expect(periodEnd('2026-12', cfg10)).toBe('2027-01-09');
    expect(periodRange('2026-11', '2027-02')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
    expect(periodRange('2026-11', '2026-10')).toEqual([]);
  });

  it('sérült azonosítónál sem fut végtelen ciklusba, és van felső korlát', () => {
    expect(periodRange('2026-10', shiftPeriod('2026-10', undefined as unknown as number))).toEqual([]);
    expect(periodRange('NaN-NaN', '2026-10')).toEqual([]);
    expect(periodRange('2026-10', '9999-12')).toHaveLength(MAX_PERIOD_RANGE);
  });

  it('két időszak távolsága hónapokban', () => {
    expect(periodDistance('2026-10', '2027-01')).toBe(3);
    expect(periodDistance('2027-01', '2026-10')).toBe(-3);
    expect(periodDistance('1900-01', '2026-10')).toBe(126 * 12 + 9);
  });

  it('megtalálja a dátumot tartalmazó időszakot', () => {
    expect(periodForDate('2026-10-07', cfg10)).toBe('2026-09');
    expect(periodForDate('2026-10-10', cfg10)).toBe('2026-10');
    expect(periodForDate('2026-11-09', cfg10)).toBe('2026-10');
    expect(periodForDate('2027-01-05', cfg10)).toBe('2026-12');
  });

  it('1-jei fizetésnapnál megegyezik a naptári hónappal', () => {
    const cfg1 = makeConfig(1, []);
    expect(periodStart('2026-10', cfg1)).toBe('2026-10-01');
    expect(periodEnd('2026-10', cfg1)).toBe('2026-10-31');
    expect(periodForDate('2026-10-31', cfg1)).toBe('2026-10');
  });
});

describe('kezdőnap felülírása', () => {
  const cfg = makeConfig(10, [{ periodId: '2026-11', startDate: '2026-11-07' }]);

  it('a felülírt időszak korábban kezdődik, az előző korábban ér véget', () => {
    expect(periodStart('2026-11', cfg)).toBe('2026-11-07');
    expect(periodEnd('2026-10', cfg)).toBe('2026-11-06');
    expect(periodForDate('2026-11-08', cfg)).toBe('2026-11');
  });

  it('nem engedi, hogy két időszak összecsússzon', () => {
    expect(validateOverride('2026-11', '2026-11-07', cfg10)).toBeNull();
    expect(validateOverride('2026-11', '2026-10-10', cfg10)).not.toBeNull();
    expect(validateOverride('2026-11', '2026-12-10', cfg10)).not.toBeNull();
  });
});

describe('fizetésnap-változás és felülírások', () => {
  it('az új fizetésnappal érvénytelenné vált felülírásokat kiszűri', () => {
    const o = [
      { periodId: '2026-11', startDate: '2026-11-07' },
      { periodId: '2027-01', startDate: '2026-12-30' },
    ];
    // 10-i fizetésnapnál mindkettő érvényes
    expect(invalidOverrides(o, 10)).toEqual([]);
    expect(invalidOverrides(o, 5)).toEqual([]);
    // 30-i fizetésnapnál a decemberi időszak is dec. 30-án kezdődne, így a januári felülírás összecsúszna vele
    expect(invalidOverrides(o, 30)).toEqual([{ periodId: '2027-01', startDate: '2026-12-30' }]);
  });

  it('egy felülírás törlése után a szomszédját is újraellenőrzi', () => {
    // Az októberi időszak szept. 25-én kezdődik, a novemberi okt. 20-án. 28-i fizetésnapnál az októberi
    // felülírás a szeptemberi kezdés (szept. 28.) elé esne; ha törlődik, október 28-án kezdődik, és akkor
    // a novemberi okt. 20. is érvénytelen lesz.
    const o = [
      { periodId: '2026-10', startDate: '2026-09-25' },
      { periodId: '2026-11', startDate: '2026-10-20' },
    ];
    expect(invalidOverrides(o, 10)).toEqual([]);
    expect(invalidOverrides(o, 28).map((x) => x.periodId)).toEqual(['2026-10', '2026-11']);
  });
});

describe('segédfüggvények', () => {
  it('„-tól/-től” alak', () => {
    expect(periodFromName('2026-10')).toBe('októbertől');
    expect(periodFromName('2027-01')).toBe('januártól');
  });

  it('állapot', () => {
    expect(periodStatus('2026-08', '2026-09')).toBe('closed');
    expect(periodStatus('2026-09', '2026-09')).toBe('current');
    expect(periodStatus('2026-10', '2026-09')).toBe('future');
  });

  it('dátumtartomány formázása', () => {
    expect(formatRange('2026-10-10', '2026-11-09')).toBe('10.10.–11.09.');
  });

  it('dátum az időszakba szorítva', () => {
    expect(clampToPeriod('2026-12-01', '2026-10', cfg10)).toBe('2026-11-09');
    expect(clampToPeriod('2026-10-01', '2026-10', cfg10)).toBe('2026-10-10');
    expect(clampToPeriod('2026-10-20', '2026-10', cfg10)).toBe('2026-10-20');
  });
});
