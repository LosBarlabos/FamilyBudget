import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import {
  addCategory, addEntry, addSettlingEntry, changePlan, importAll, initialize, markSettled, migrateBasePlans, moveCover, rawDump,
  restoreCategory, restoreEntries, restorePlansOf, restoreSettings, saveBasicSettings, setMonthlyTotal, setOverride, unsettle,
  undoMoveCover, updateCategory, wipeAll,
} from './repo';
import { computeSummaries } from '../domain/balance';
import { buildExport, parseImport } from '../domain/exportFormat';
import { suggestedAmounts } from '../domain/quick';
import type { BudgetData, Category, Settings } from '../domain/types';

const settings: Settings = {
  id: 'settings', payday: 10, openingBalance: 0, firstPeriodId: '2026-08', forecastPeriods: 3, createdAt: '2026-08-10T00:00:00Z',
};

const cat = (id: string, defaultAmount: number, extra: Partial<Category> = {}): Category => ({
  id, name: id, icon: 'dots', color: '#000', type: 'keret', defaultAmount, order: 0, archived: false, ...extra,
});

async function data(): Promise<BudgetData> {
  const [s, categories, plans, entries, overrides] = await Promise.all([
    db.settings.get('settings'), db.categories.toArray(), db.plans.toArray(), db.entries.toArray(), db.periodOverrides.toArray(),
  ]);
  return { settings: s!, categories, plans, entries, overrides };
}

beforeEach(async () => {
  await wipeAll();
});

const planRows = async () =>
  (await db.plans.orderBy('[periodId+categoryId]').toArray()).map((p) => `${p.periodId}|${p.categoryId}|${p.amount}`);

describe('alapösszeg-tervek', () => {
  it('az első indítás az első időszakra írja a terveket', async () => {
    await initialize(settings, [cat('kaja', 100_000), cat('auto', 20_000)]);
    expect(await db.plans.orderBy('categoryId').toArray()).toEqual([
      { periodId: '2026-08', categoryId: 'auto', amount: 20_000 },
      { periodId: '2026-08', categoryId: 'kaja', amount: 100_000 },
    ]);
  });

  it('az indításkori migráció pótolja a hiányzó terveket, és idempotens', async () => {
    await db.settings.put(settings);
    await db.categories.bulkPut([cat('kaja', 100_000), cat('auto', 20_000)]);
    await db.plans.put({ periodId: '2026-07', categoryId: 'auto', amount: 15_000 });
    expect(await migrateBasePlans()).toBe(1);
    expect(await migrateBasePlans()).toBe(0);
    expect(await db.plans.get(['2026-08', 'kaja'])).toMatchObject({ amount: 100_000 });
    expect(await db.plans.get(['2026-08', 'auto'])).toBeUndefined();
  });

  it('beállítások nélkül nem csinál semmit', async () => {
    await db.categories.put(cat('kaja', 100_000));
    expect(await migrateBasePlans()).toBe(0);
  });

  it('új kategória a mostani időszaktól kap tervet, a múltban 0-t', async () => {
    await initialize(settings, []);
    await addCategory(cat('uj', 40_000), '2026-10');
    const s = computeSummaries(await data(), '2026-10-20');
    expect(s.byId.get('2026-09')!.byCategory.get('uj')!.plan).toBe(0);
    expect(s.byId.get('2026-10')!.byCategory.get('uj')!.plan).toBe(40_000);
  });

  it('az alapösszeg módosítása csak a mostani időszaktól hat, és visszavonható', async () => {
    const kaja = cat('kaja', 100_000);
    await initialize(settings, [kaja]);
    await db.plans.put({ periodId: '2026-11', categoryId: 'kaja', amount: 150_000 });
    const changed = { ...kaja, defaultAmount: 90_000 };
    const { plansBefore, amountChanged } = await updateCategory(kaja, changed, '2026-10');
    expect(amountChanged).toBe(true);
    let s = computeSummaries(await data(), '2026-10-20');
    expect(s.byId.get('2026-09')!.byCategory.get('kaja')!.plan).toBe(100_000);
    expect(s.byId.get('2026-10')!.byCategory.get('kaja')!.plan).toBe(90_000);
    expect(s.byId.get('2026-11')!.byCategory.get('kaja')!.plan).toBe(90_000);

    await restoreCategory(kaja, plansBefore);
    s = computeSummaries(await data(), '2026-10-20');
    expect((await db.categories.get('kaja'))!.defaultAmount).toBe(100_000);
    expect(s.byId.get('2026-10')!.byCategory.get('kaja')!.plan).toBe(100_000);
    expect(s.byId.get('2026-11')!.byCategory.get('kaja')!.plan).toBe(150_000);
  });

  it('ha az alapösszeg nem változik, a tervek sem', async () => {
    const kaja = cat('kaja', 100_000);
    await initialize(settings, [kaja]);
    await db.plans.put({ periodId: '2026-11', categoryId: 'kaja', amount: 150_000 });
    const { amountChanged } = await updateCategory(kaja, { ...kaja, name: 'Élelmiszer' }, '2026-10');
    expect(amountChanged).toBe(false);
    expect(await db.plans.count()).toBe(2);
  });
});

describe('fix tétel lezárása', () => {
  beforeEach(async () => {
    await initialize(settings, [cat('aram', 15_000, { type: 'fix' })]);
  });

  it('a lezáró rögzítéssel a tervnél kisebb tény is kész, és a tény számít', async () => {
    await addSettlingEntry('2026-10', 'aram', 12_400, '2026-10-15');
    const f = computeSummaries(await data(), '2026-10-20').byId.get('2026-10')!.byCategory.get('aram')!;
    expect(f).toMatchObject({ actual: 12_400, counted: 12_400, settled: true });
  });

  it('„Kész, több nem lesz”: a legutolsó részletet jelöli meg, és visszavonható', async () => {
    // Kézzel megadott időbélyeggel, mert két gyors addEntry ugyanarra az ezredmásodpercre eshet.
    const base = { periodId: '2026-10', categoryId: 'aram', date: '2026-10-11' };
    await db.entries.put({ ...base, id: 'a', amount: 5_000, createdAt: '2026-10-11T10:00:00.000Z' });
    const last = { ...base, id: 'b', amount: 6_000, createdAt: '2026-10-12T10:00:00.000Z' };
    await db.entries.put(last);
    const before = await markSettled('2026-10', 'aram');
    expect(before?.id).toBe(last.id);
    expect((await db.entries.get(last.id))!.settles).toBe(true);
    expect(await markSettled('2026-10', 'aram')).toBeNull();
    await restoreEntries([before!]);
    expect((await db.entries.get(last.id))!.settles).toBeUndefined();
  });

  it('rögzítés nélkül nincs mit lezárni', async () => {
    expect(await markSettled('2026-10', 'aram')).toBeNull();
  });

  it('a lezárás visszavehető, a rögzítések megmaradnak', async () => {
    const e = await addSettlingEntry('2026-10', 'aram', 12_400, '2026-10-15');
    const changed = await unsettle('2026-10', 'aram');
    expect(changed.map((x) => x.id)).toEqual([e.id]);
    expect(await db.entries.get(e.id)).not.toHaveProperty('settles');
    expect(await db.entries.count()).toBe(1);
  });

  it('0 Ft csak lezárásként rögzíthető („Nem volt”)', async () => {
    await expect(addEntry('2026-10', 'aram', 0, '2026-10-15')).rejects.toThrow();
    await expect(addEntry('2026-10', 'aram', 12.5, '2026-10-15')).rejects.toThrow();
    const e = await addSettlingEntry('2026-10', 'aram', 0, '2026-10-15');
    expect(e).toMatchObject({ amount: 0, settles: true });
  });

  it('a felhasználás nem kap lezárás jelzőt', async () => {
    const e = await addEntry('2026-10', 'aram', 1_000, '2026-10-15', undefined, 'withdrawal', true);
    expect(e.settles).toBeUndefined();
  });
});

describe('havi összeg megadása', () => {
  it('a részletek helyére egy megjelölt havi összeg kerül, ami nem lesz gyorsgomb', async () => {
    await initialize(settings, [cat('tank', 60_000)]);
    const part = await addEntry('2026-10', 'tank', 15_000, '2026-10-12');
    const { old, created } = await setMonthlyTotal('2026-10', 'tank', 62_300, '2026-10-20');
    expect(old.map((e) => e.id)).toEqual([part.id]);
    expect(created).toMatchObject({ amount: 62_300, monthlyTotal: true });
    expect(suggestedAmounts((await data()).entries, 'tank', '2026-11')).not.toContain(62_300);
    // Mentésen át is megmarad a jelölés.
    const back = parseImport(JSON.stringify(buildExport(await data())));
    expect(back.entries.find((e) => e.id === created.id)?.monthlyTotal).toBe(true);
  });
});

describe('beállítások mentése', () => {
  it('a fizetésnap módosítása törli az érvénytelenné vált felülírásokat, és visszavonható', async () => {
    await initialize(settings, []);
    await setOverride({ periodId: '2026-11', startDate: '2026-11-07' });
    await setOverride({ periodId: '2027-01', startDate: '2026-12-30' });
    const { before, removed } = await saveBasicSettings({ payday: 30 });
    expect(removed.map((o) => o.periodId)).toEqual(['2027-01']);
    expect((await db.periodOverrides.toArray()).map((o) => o.periodId)).toEqual(['2026-11']);
    expect((await db.settings.get('settings'))!.payday).toBe(30);

    await restoreSettings(before, removed);
    expect((await db.settings.get('settings'))!.payday).toBe(10);
    expect(await db.periodOverrides.count()).toBe(2);
  });

  it('változatlan fizetésnapnál a felülírásokhoz nem nyúl', async () => {
    await initialize(settings, []);
    await setOverride({ periodId: '2026-11', startDate: '2026-11-07' });
    const { removed } = await saveBasicSettings({ payday: 10, openingBalance: 5_000 });
    expect(removed).toEqual([]);
    expect((await db.settings.get('settings'))!.openingBalance).toBe(5_000);
  });
});

describe('visszatöltés', () => {
  it('a normalizált mentést betölti, és a hiányzó alapterveket is megírja', async () => {
    const exported = buildExport({
      settings, categories: [cat('kaja', 100_000)], plans: [], overrides: [],
      entries: [{ id: 'e1', periodId: '2026-09', categoryId: 'kaja', amount: 80_000, date: '2026-09-15', createdAt: '' }],
    });
    await importAll(parseImport(JSON.stringify(exported)));
    expect(await db.plans.get(['2026-08', 'kaja'])).toMatchObject({ amount: 100_000 });
    expect(await db.entries.count()).toBe(1);
  });

  it('adatbázishibánál dob, és a korábbi adatok megmaradnak', async () => {
    await initialize(settings, [cat('kaja', 100_000)]);
    const broken = { ...buildExport(await data()), entries: [{ periodId: '2026-09' }] };
    // Szándékosan a parseImport megkerülésével: a tranzakció visszagördül.
    await expect(importAll(broken as never)).rejects.toThrow();
    expect(await db.categories.count()).toBe(1);
  });
});

describe('tervmódosítás visszavonása', () => {
  it('a changePlan a kategória korábbi terveit adja vissza, és ezzel visszaállítható', async () => {
    const kaja = cat('kaja', 100_000);
    await initialize(settings, [kaja, cat('auto', 20_000)]);
    await db.plans.put({ periodId: '2026-12', categoryId: 'kaja', amount: 150_000 });
    const before = await changePlan(kaja, '2026-10', 95_000, 'from');
    expect(await db.plans.get(['2026-12', 'kaja'])).toBeUndefined();
    await restorePlansOf('kaja', before);
    expect(await db.plans.get(['2026-12', 'kaja'])).toMatchObject({ amount: 150_000 });
    expect(await db.plans.get(['2026-10', 'kaja'])).toBeUndefined();
    expect(await db.plans.get(['2026-08', 'auto'])).toMatchObject({ amount: 20_000 });
  });
});

describe('fedezet áthozása', () => {
  it('két „csak erre a hónapra” terv, egyetlen visszavonással', async () => {
    const kaja = cat('kaja', 100_000);
    const szabad = cat('szabad', 30_000);
    await initialize(settings, [kaja, szabad, cat('auto', 20_000)]);
    await addEntry('2026-10', 'kaja', 108_000, '2026-10-15');
    await addEntry('2026-10', 'szabad', 12_000, '2026-10-15');
    const change = await moveCover(szabad, kaja, '2026-10', 8_000);
    const s = computeSummaries(await data(), '2026-10-20');
    const plan = (p: string, id: string) => s.byId.get(p)!.byCategory.get(id)!.plan;
    expect([plan('2026-10', 'szabad'), plan('2026-10', 'kaja')]).toEqual([22_000, 108_000]);
    expect([plan('2026-11', 'szabad'), plan('2026-11', 'kaja')]).toEqual([30_000, 100_000]);

    await undoMoveCover(change);
    expect(await planRows()).toEqual(['2026-08|auto|20000', '2026-08|kaja|100000', '2026-08|szabad|30000']);
  });

  it('két áthozás ugyanabba a keretbe: a régebbi visszavonása csak azt az egyet vonja vissza', async () => {
    const kaja = cat('kaja', 100_000);
    const a = cat('a', 30_000);
    const b = cat('b', 30_000);
    await initialize(settings, [kaja, a, b]);
    await addEntry('2026-10', 'kaja', 120_000, '2026-10-15');
    const u1 = await moveCover(a, kaja, '2026-10', 10_000);
    const u2 = await moveCover(b, kaja, '2026-10', 10_000);
    const plans = async (p: string) => {
      const s = computeSummaries(await data(), '2026-10-20').byId.get(p)!;
      return ['kaja', 'a', 'b'].map((id) => s.byCategory.get(id)!.plan);
    };
    expect(await plans('2026-10')).toEqual([120_000, 20_000, 20_000]);

    await undoMoveCover(u1);
    // A tervek összege nem változik: csak az első áthozás 10 000 Ft-ja megy vissza.
    expect(await plans('2026-10')).toEqual([110_000, 30_000, 20_000]);
    expect(await plans('2026-11')).toEqual([100_000, 30_000, 30_000]);

    await undoMoveCover(u2);
    expect(await plans('2026-10')).toEqual([100_000, 30_000, 30_000]);
    expect(await plans('2026-11')).toEqual([100_000, 30_000, 30_000]);
  });

  it('a megszokott sorrendű (újabb előbb) visszavonás a rekordokat is pontosan visszaállítja', async () => {
    const kaja = cat('kaja', 100_000);
    const a = cat('a', 30_000);
    const b = cat('b', 30_000);
    await initialize(settings, [kaja, a, b]);
    const u1 = await moveCover(a, kaja, '2026-10', 10_000);
    const u2 = await moveCover(b, kaja, '2026-10', 5_000);
    await undoMoveCover(u2);
    await undoMoveCover(u1);
    expect(await planRows()).toEqual(['2026-08|a|30000', '2026-08|b|30000', '2026-08|kaja|100000']);
  });

  it('nem von vissza, ha a cél terve azóta az áthozott összeg alá csökkent', async () => {
    const kaja = cat('kaja', 100_000);
    const szabad = cat('szabad', 30_000);
    await initialize(settings, [kaja, szabad]);
    const change = await moveCover(szabad, kaja, '2026-10', 8_000);
    await changePlan(kaja, '2026-10', 5_000, 'only');
    await expect(undoMoveCover(change)).rejects.toThrow('kevesebb');
    expect(await db.plans.get(['2026-10', 'szabad'])).toMatchObject({ amount: 22_000 });
  });

  it('a forrás tárolt maradékánál többet nem hoz át, és ilyenkor semmi nem változik', async () => {
    const kaja = cat('kaja', 100_000);
    const szabad = cat('szabad', 30_000);
    await initialize(settings, [kaja, szabad]);
    await addEntry('2026-10', 'szabad', 25_000, '2026-10-15');
    await expect(moveCover(szabad, kaja, '2026-10', 6_000)).rejects.toThrow('csak');
    expect(await db.plans.count()).toBe(2);
  });
});

describe('típusváltás', () => {
  it('rögzítés után a kiadás nem fordítható bevételre, de fix és keret között váltható', async () => {
    const kaja = cat('kaja', 100_000);
    await initialize(settings, [kaja]);
    await addEntry('2026-09', 'kaja', 5_000, '2026-09-15');
    await expect(updateCategory(kaja, { ...kaja, type: 'bevetel' }, '2026-10')).rejects.toThrow();
    await updateCategory(kaja, { ...kaja, type: 'fix' }, '2026-10');
    expect((await db.categories.get('kaja'))!.type).toBe('fix');
  });

  it('rögzítés nélkül bármire váltható', async () => {
    const kaja = cat('kaja', 100_000);
    await initialize(settings, [kaja]);
    await updateCategory(kaja, { ...kaja, type: 'megtakaritas' }, '2026-10');
    expect((await db.categories.get('kaja'))!.type).toBe('megtakaritas');
  });
});

describe('első indítás a következő fizetéssel', () => {
  it('a mostani időszak 0-s tervet kap, a megtörtént tételek rögzülnek', async () => {
    await initialize({ ...settings, firstPeriodId: '2026-10' }, [cat('kaja', 100_000)], {
      currentId: '2026-09',
      entries: [{ id: 'x', periodId: '2026-09', categoryId: 'kaja', amount: 0, date: '2026-10-07', settles: true, createdAt: '' }],
    });
    expect(await db.plans.get(['2026-09', 'kaja'])).toMatchObject({ amount: 0 });
    expect(await db.plans.get(['2026-10', 'kaja'])).toMatchObject({ amount: 100_000 });
    expect(await db.entries.count()).toBe(1);
  });

  const start = async () => {
    const fiz = cat('fiz', 500_000, { type: 'bevetel' });
    await initialize({ ...settings, openingBalance: 300_000, firstPeriodId: '2026-10' }, [fiz, cat('kaja', 100_000)], { currentId: '2026-09' });
    return fiz;
  };

  it('az alapösszeg módosítása az első időszaktól hat, a még el nem indult előidőszakot nem írja', async () => {
    const fiz = await start();
    const { fromId } = await updateCategory(fiz, { ...fiz, defaultAmount: 520_000 }, '2026-09');
    expect(fromId).toBe('2026-10');
    const s = computeSummaries(await data(), '2026-10-07');
    expect(s.byId.get('2026-09')!.income).toBe(0);
    expect(s.byId.get('2026-09')!.endBalance).toBe(300_000);
    expect(s.byId.get('2026-10')!.byCategory.get('fiz')!.plan).toBe(520_000);
  });

  it('az új kategória az első időszaktól kap tervet, az előidőszakban nem vonódik le', async () => {
    await start();
    await addCategory(cat('uj', 40_000), '2026-09');
    const s = computeSummaries(await data(), '2026-10-07');
    expect(s.byId.get('2026-09')!.expense).toBe(0);
    expect(s.byId.get('2026-10')!.byCategory.get('uj')!.plan).toBe(40_000);
  });
});

describe('vészmentés', () => {
  it('a nyers táblákat adja vissza, beállítások nélkül is', async () => {
    await db.categories.put(cat('kaja', 100_000));
    const raw = await rawDump(new Date('2026-10-20T00:00:00Z'));
    expect(raw.settings).toBeNull();
    expect(raw.categories).toHaveLength(1);
  });
});
