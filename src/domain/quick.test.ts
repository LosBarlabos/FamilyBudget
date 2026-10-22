import { describe, expect, it } from 'vitest';
import { computeSummaries } from './balance';
import {
  billChipText, DEFAULT_QUICK_AMOUNTS, offersPreviousPeriod, quickEnvelopes, recentEntries, recordedAtText, suggestedAmounts, usageCounts,
} from './quick';
import { dueBills } from './todos';
import type { BudgetData, Category, Entry } from './types';

const sp = (s: string) => s.replace(/\s/g, ' ');

let order = 0;
const cat = (id: string, type: Category['type'], defaultAmount: number, extra: Partial<Category> = {}): Category => ({
  id, name: id, icon: 'dots', color: '#000', type, defaultAmount, order: order++, archived: false, ...extra,
});

let n = 0;
const entry = (periodId: string, categoryId: string, amount: number, extra: Partial<Entry> = {}): Entry => {
  const i = n++;
  return {
    id: `e${String(i).padStart(4, '0')}`, periodId, categoryId, amount, date: `${periodId}-15`,
    // A sorrend a létrehozás sorrendje: a később létrehozott a frissebb.
    createdAt: `2026-01-01T00:00:00.${String(i).padStart(3, '0')}Z`, ...extra,
  };
};

describe('javasolt összegek', () => {
  it('adat nélkül a +5e/+10e/+20e', () => {
    expect(suggestedAmounts([], 'kaja', '2026-10')).toEqual(DEFAULT_QUICK_AMOUNTS);
    expect(suggestedAmounts([entry('2026-10', 'mas', 7000)], 'kaja', '2026-10')).toEqual(DEFAULT_QUICK_AMOUNTS);
  });

  it('a 3 leggyakoribb, 100 Ft-ra kerekített összeg, növekvő sorrendben', () => {
    const list = [
      entry('2026-10', 'kaja', 12_430), entry('2026-10', 'kaja', 12_380), entry('2026-09', 'kaja', 12_400),
      entry('2026-09', 'kaja', 4_990), entry('2026-08', 'kaja', 5_020),
      entry('2026-08', 'kaja', 30_000), entry('2026-09', 'kaja', 30_000),
      entry('2026-10', 'kaja', 8_000),
      // A legutóbbi egyben gyakori is: nem jön kétszer.
      entry('2026-10', 'kaja', 12_400),
    ];
    expect(suggestedAmounts(list, 'kaja', '2026-10')).toEqual([5000, 12_400, 30_000]);
  });

  it('a legutóbbi összeg akkor is benne van, ha ritka', () => {
    const list = [
      entry('2026-10', 'kaja', 5000), entry('2026-10', 'kaja', 5000),
      entry('2026-10', 'kaja', 10_000), entry('2026-10', 'kaja', 10_000),
      entry('2026-10', 'kaja', 20_000), entry('2026-10', 'kaja', 20_000),
      entry('2026-10', 'kaja', 47_250),
    ];
    expect(suggestedAmounts(list, 'kaja', '2026-10')).toEqual([5000, 10_000, 20_000, 47_300]);
  });

  it('egyenlő gyakoriságnál a frissebb nyer', () => {
    const list = [1000, 2000, 3000, 4000, 5000].map((a) => entry('2026-10', 'kaja', a));
    expect(suggestedAmounts(list, 'kaja', '2026-10')).toEqual([3000, 4000, 5000]);
  });

  it('csak az utolsó 3 időszakból, a felhasználások és a későbbi időszakok nélkül', () => {
    const list = [
      entry('2026-07', 'kaja', 99_000), entry('2026-07', 'kaja', 99_000),
      entry('2026-11', 'kaja', 77_000),
      entry('2026-10', 'kaja', 66_000, { kind: 'withdrawal' }),
      entry('2026-08', 'kaja', 15_000),
      // 100 Ft alatti összeg 0-ra kerekedne: kimarad.
      entry('2026-10', 'kaja', 40),
    ];
    expect(suggestedAmounts(list, 'kaja', '2026-10')).toEqual([15_000]);
  });

  it('a „Havi összeg megadása” összege nem gyorsgomb', () => {
    const list = [entry('2026-09', 'tank', 15_000), entry('2026-09', 'tank', 62_300, { monthlyTotal: true })];
    expect(suggestedAmounts(list, 'tank', '2026-10')).toEqual([15_000]);
    expect(suggestedAmounts(list.slice(1), 'tank', '2026-10')).toEqual(DEFAULT_QUICK_AMOUNTS);
  });
});

describe('gyorsrögzítő keretei', () => {
  const cats = [
    cat('kaja', 'keret', 0), cat('auto', 'keret', 0), cat('szabad', 'keret', 0),
    cat('regi', 'keret', 0, { archived: true }), cat('aram', 'fix', 0),
  ];

  it('a 60 napos használat szerint, azon belül a megszokott sorrendben', () => {
    const list = [
      entry('2026-10', 'szabad', 1000, { date: '2026-10-08' }),
      entry('2026-09', 'szabad', 1000, { date: '2026-08-10' }),
      entry('2026-09', 'auto', 1000, { date: '2026-09-01' }),
      // 61 napja: már nem számít.
      entry('2026-07', 'auto', 1000, { date: '2026-08-08' }),
      entry('2026-07', 'auto', 1000, { date: '2026-08-08' }),
      // Jövőbe előre rögzített és felhasználás: nem használat.
      entry('2026-11', 'auto', 1000, { date: '2026-11-12' }),
      entry('2026-09', 'auto', 1000, { date: '2026-09-02', kind: 'withdrawal' }),
    ];
    expect(usageCounts(list, '2026-10-08')).toEqual(new Map([['szabad', 2], ['auto', 1]]));
    expect(quickEnvelopes(cats, list, '2026-10-08').map((c) => c.id)).toEqual(['szabad', 'auto', 'kaja']);
  });

  it('rögzítés nélkül a megszokott sorrend, archivált és nem keret kategória nélkül', () => {
    expect(quickEnvelopes(cats, [], '2026-10-08').map((c) => c.id)).toEqual(['kaja', 'auto', 'szabad']);
  });
});

describe('időszakválasztó az új időszak elején', () => {
  it('a kezdőnappal együtt 3 napig', () => {
    expect(offersPreviousPeriod('2026-10-10', '2026-10-10')).toBe(true);
    expect(offersPreviousPeriod('2026-10-10', '2026-10-12')).toBe(true);
    expect(offersPreviousPeriod('2026-10-10', '2026-10-13')).toBe(false);
    expect(offersPreviousPeriod('2026-10-10', '2026-10-09')).toBe(false);
  });
});

describe('esedékes számlák a gyorsrögzítőben', () => {
  const cats = [
    cat('aram', 'fix', 18_000, { name: 'Áram', dueDay: 15 }),
    cat('net', 'fix', 9_000, { name: 'Internet', dueDay: 12 }),
    cat('gaz', 'fix', 12_000, { name: 'Gáz', dueDay: 30 }),
    cat('hitel', 'fix', 120_000, { name: 'Hitel', dueDay: 11 }),
    cat('nap', 'fix', 5_000, { name: 'Nincs nap' }),
  ];
  const data = (entries: Entry[]): BudgetData => ({
    settings: { id: 'settings', payday: 10, openingBalance: 0, firstPeriodId: '2026-09', forecastPeriods: 2, createdAt: '2026-09-01T00:00:00Z' },
    categories: cats,
    plans: [],
    entries,
    overrides: [],
  });

  it('lejárt vagy 5 napon belül esedékes, nem lezárt; a részben fizetettnél a hátralék', () => {
    const s = computeSummaries(data([entry('2026-10', 'net', 4_000), entry('2026-10', 'hitel', 120_000, { settles: true })]), '2026-10-13');
    const bills = dueBills(cats, s.byId.get('2026-10')!, '2026-10-13');
    expect(bills.map((b) => [b.cat.id, b.amount, b.partial, b.overdue])).toEqual([
      ['net', 5_000, true, true],
      ['aram', 18_000, false, false],
    ]);
    expect(sp(billChipText('Áram', 18_000))).toBe('Áram · 18 000 Ft');
  });
});

describe('legutóbbi rögzítések', () => {
  it('a rögzítés ideje szerint csökkenő sorrendben, legfeljebb 10', () => {
    const list = Array.from({ length: 12 }, (_, i) => entry(i % 2 ? '2026-09' : '2026-10', 'kaja', 1000 + i));
    const recent = recentEntries(list);
    expect(recent).toHaveLength(10);
    expect(recent[0].amount).toBe(1011);
    expect(recent[9].amount).toBe(1002);
  });

  it('„ma 18:42”, „tegnap 9:05”, régebben dátummal', () => {
    const at = (d: number, h: number, m: number) => new Date(2026, 9, d, h, m).toISOString();
    expect(recordedAtText(at(8, 18, 42), '2026-10-08')).toBe('ma 18:42');
    expect(recordedAtText(at(7, 9, 5), '2026-10-08')).toBe('tegnap 9:05');
    expect(recordedAtText(at(6, 0, 0), '2026-10-08')).toBe('okt. 6. 0:00');
    expect(recordedAtText('hibás', '2026-10-08')).toBe('');
  });
});
