import { describe, expect, it } from 'vitest';
import { formatFt, formatShort, parseAmount } from './money';
import { dueDateInPeriod, fixStatus, isOverdue } from './status';
import { buildExport, migrateExport, parseImport, previewImport } from './exportFormat';
import type { BudgetData } from './types';

describe('összegek', () => {
  it('formázás', () => {
    expect(formatFt(1234567).replace(/\s/g, ' ')).toBe('1 234 567 Ft');
    expect(formatFt(-1500).replace(/\s/g, ' ')).toBe('-1 500 Ft');
    expect(formatShort(450_000)).toBe('450e');
    expect(formatShort(1_200_000)).toBe('1,2M');
    expect(formatShort(2_000_000)).toBe('2M');
  });

  it('beírt összeg értelmezése', () => {
    expect(parseAmount('12000')).toBe(12000);
    expect(parseAmount('12 000')).toBe(12000);
    expect(parseAmount('12.000 Ft')).toBe(12000);
    expect(parseAmount('12e')).toBe(12000);
    expect(parseAmount('1,5e')).toBe(1500);
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('0')).toBeNull();
    expect(parseAmount('-5')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
  });

  it('a pont csak pontosan 3 számjegy előtt ezres elválasztó, különben tizedesjel', () => {
    expect(parseAmount('12.5e')).toBe(12_500);
    expect(parseAmount('12,5e')).toBe(12_500);
    expect(parseAmount('1.234.567')).toBe(1_234_567);
    expect(parseAmount('1.234,5')).toBe(1235);
    expect(parseAmount('1.5')).toBe(2);
    expect(parseAmount('1.2345')).toBe(1);
    expect(parseAmount('12.000 Ft')).toBe(12_000);
    expect(parseAmount('12\u00a0000\u00a0Ft')).toBe(12_000);
    expect(parseAmount('1.2.3')).toBeNull();
  });
});

describe('állapotok', () => {
  it('fix tétel', () => {
    expect(fixStatus(12000, 0)).toBe('unpaid');
    expect(fixStatus(12000, 5000)).toBe('partial');
    expect(fixStatus(12000, 12000)).toBe('paid');
    expect(fixStatus(12000, 13500)).toBe('paidDiff');
  });

  it('lezárt fix tétel', () => {
    expect(fixStatus(12000, 10500, true)).toBe('paidDiff');
    expect(fixStatus(12000, 12000, true)).toBe('paid');
    expect(fixStatus(12000, 0, true)).toBe('paidDiff');
    expect(fixStatus(0, 0, true)).toBe('paid');
    expect(isOverdue('2026-10-15', '2026-10-20', fixStatus(12000, 10500, true))).toBe(false);
  });

  it('esedékesség az időszakon belül', () => {
    expect(dueDateInPeriod(15, '2026-10-10', '2026-11-09')).toBe('2026-10-15');
    expect(dueDateInPeriod(5, '2026-10-10', '2026-11-09')).toBe('2026-11-05');
    expect(dueDateInPeriod(31, '2026-02-10', '2026-03-09')).toBe('2026-02-28');
  });

  it('lejárt tétel', () => {
    expect(isOverdue('2026-10-15', '2026-10-20', 'unpaid')).toBe(true);
    expect(isOverdue('2026-10-15', '2026-10-20', 'paid')).toBe(false);
    expect(isOverdue('2026-10-25', '2026-10-20', 'unpaid')).toBe(false);
  });
});

describe('mentés', () => {
  const data: BudgetData = {
    settings: { id: 'settings', payday: 10, openingBalance: 0, firstPeriodId: '2026-10', forecastPeriods: 6, createdAt: '' },
    categories: [{ id: 'c', name: 'C', icon: 'dots', color: '#000', type: 'keret', defaultAmount: 0, order: 0, archived: false }],
    plans: [{ periodId: '2026-10', categoryId: 'c', amount: 5 }],
    entries: [{ id: 'e', periodId: '2026-11', categoryId: 'c', amount: 3, date: '2026-11-11', createdAt: '2026-11-11T10:00:00Z' }],
    overrides: [],
  };

  it('oda-vissza alakítás', () => {
    const f = parseImport(JSON.stringify(buildExport(data)));
    expect(f.entries).toHaveLength(1);
    expect(previewImport(f)).toMatchObject({ periods: 2, categories: 1, entries: 1, lastChange: '2026-11-11T10:00:00Z' });
  });

  it('hibás fájlt elutasít', () => {
    expect(() => parseImport('nem json')).toThrow('JSON');
    expect(() => parseImport('{"app":"mas"}')).toThrow();
    expect(() => parseImport(JSON.stringify({ ...buildExport(data), schemaVersion: 99 }))).toThrow('újabb');
    expect(() => parseImport(JSON.stringify({ ...buildExport(data), schemaVersion: undefined }))).toThrow('sémaverzió');
  });

  const file = (patch: (f: ReturnType<typeof buildExport>) => object) =>
    JSON.stringify(patch(JSON.parse(JSON.stringify(buildExport(data)))));

  it('hiányzó mezőket alapértékkel pótol, az összegeket egész forintra kerekíti', () => {
    const f = parseImport(
      file((f) => {
        const { forecastPeriods: _, openingBalance: __, ...settings } = f.settings;
        const { archived: ___, order: ____, ...cat } = f.categories[0];
        return { ...f, settings, categories: [cat], plans: [{ ...f.plans[0], amount: 5.4 }], entries: [{ ...f.entries[0], amount: '8000' }] };
      }),
    );
    expect(f.settings.forecastPeriods).toBe(6);
    expect(f.settings.openingBalance).toBe(0);
    expect(f.categories[0]).toMatchObject({ archived: false, order: 0 });
    expect(f.plans[0].amount).toBe(5);
    expect(f.entries[0].amount).toBe(8000);
  });

  it('az ismeretlen, de azonos sémájú mezőket megtartja, az érvényteleneket elhagyja', () => {
    const f = parseImport(
      file((f) => ({
        ...f,
        categories: [{ ...f.categories[0], excludeFromDaily: true, dueDay: 45 }],
        entries: [{ ...f.entries[0], settles: true }],
      })),
    );
    expect(f.categories[0]).toMatchObject({ excludeFromDaily: true });
    expect(f.categories[0]).not.toHaveProperty('dueDay');
    expect(f.entries[0].settles).toBe(true);
  });

  it('érvénytelen rekordnál megmondja, mi és hol hibás', () => {
    const bad = (patch: (f: ReturnType<typeof buildExport>) => object) => () => parseImport(file(patch));
    expect(bad((f) => ({ ...f, entries: [{ ...f.entries[0], amount: 'sok' }] }))).toThrow('1. rögzítés: az összeg érvénytelen');
    expect(bad((f) => ({ ...f, entries: [{ ...f.entries[0], categoryId: 'x' }] }))).toThrow('1. rögzítés: ismeretlen kategóriára');
    expect(bad((f) => ({ ...f, plans: [{ ...f.plans[0], periodId: '2026-1' }] }))).toThrow('1. terv: az időszak');
    expect(bad((f) => ({ ...f, categories: [{ ...f.categories[0], type: 'egyeb' }] }))).toThrow('1. kategória („C”): ismeretlen típus');
    expect(bad((f) => ({ ...f, settings: { ...f.settings, payday: 0 } }))).toThrow('Beállítások: a fizetésnap');
    expect(bad((f) => ({ ...f, settings: { ...f.settings, firstPeriodId: 'NaN-NaN' } }))).toThrow('első időszak');
    expect(bad((f) => ({ ...f, settings: { ...f.settings, firstPeriodId: '1900-01' } }))).toThrow('első időszak (1900. január) túl régi');
    expect(bad((f) => ({ ...f, settings: { ...f.settings, firstPeriodId: '2999-01' } }))).toThrow('túl messze van a jövőben');
    expect(bad((f) => ({ ...f, entries: [f.entries[0], f.entries[0]] }))).toThrow('2. rögzítés: az azonosító ismétlődik');
  });

  it('sok hibánál az első hármat mondja ki', () => {
    const e = data.entries[0];
    const text = file((f) => ({ ...f, entries: [1, 2, 3, 4, 5].map((i) => ({ ...e, id: `e${i}`, amount: -1 })) }));
    expect(() => parseImport(text)).toThrow('és még 2 hiba');
  });

  it('a régi sémaverziót lépésenként alakítja át', () => {
    const steps = {
      1: (f: Record<string, unknown>) => ({ ...f, adjustments: [] }),
      2: (f: Record<string, unknown>) => ({ ...f, note: 'v3' }),
    };
    const out = migrateExport({ app: 'csaladi-koltsegvetes', schemaVersion: 1 }, steps, 3);
    expect(out).toEqual({ app: 'csaladi-koltsegvetes', schemaVersion: 3, adjustments: [], note: 'v3' });
    expect(() => migrateExport({ schemaVersion: 1 }, {}, 2)).toThrow('nem tudja átalakítani');
    expect(migrateExport({ schemaVersion: 1 })).toEqual({ schemaVersion: 1 });
  });
});
