import { db } from './db';
import { newId, unexpectedCategory } from '../domain/defaults';
import { rawExport, type ExportFile } from '../domain/exportFormat';
import { coverOps, uncoverOps, type CoverChange } from '../domain/flex';
import { invalidOverrides } from '../domain/periods';
import { initialPlans, missingBasePlans, newCategoryPlans, planChangeOps, planStartId, type PlanMode } from '../domain/plans';
import { allowedTypes, type Category, type Entry, type ISODate, type PeriodId, type PeriodOverride, type Plan, type Settings } from '../domain/types';

export async function loadAll() {
  const [settings, categories, plans, entries, overrides] = await Promise.all([
    db.settings.get('settings'),
    db.categories.orderBy('order').toArray(),
    db.plans.toArray(),
    db.entries.toArray(),
    db.periodOverrides.toArray(),
  ]);
  return { settings, categories, plans, entries, overrides };
}

/**
 * Első indítás. A currentId a mai nap időszaka: ha a költségvetés csak a következő fizetéssel indul, ott 0-s
 * terv lesz. Az entries a varázslóban „már megtörtént”-ként jelölt tételek.
 */
export async function initialize(settings: Settings, categories: Category[], opts: { currentId?: PeriodId; entries?: Entry[] } = {}) {
  await db.transaction('rw', [db.settings, db.categories, db.plans, db.entries], async () => {
    await db.categories.bulkPut(categories);
    await db.plans.bulkPut(initialPlans(categories, settings.firstPeriodId, opts.currentId ?? settings.firstPeriodId));
    await db.entries.bulkPut(opts.entries ?? []);
    await db.settings.put(settings);
  });
}

/** Vészmentés a hibaképernyőhöz: a táblák nyers tartalma, számolás nélkül. */
export async function rawDump(now = new Date()) {
  const [settings, categories, plans, entries, overrides] = await Promise.all([
    db.settings.get('settings'),
    db.categories.toArray(),
    db.plans.toArray(),
    db.entries.toArray(),
    db.periodOverrides.toArray(),
  ]);
  return rawExport({ settings, categories, plans, entries, overrides }, now);
}

/**
 * Indításkori migráció: minden kategória kap tervrekordot az első időszakra, ha még nincs neki ott vagy
 * korábban, hogy az alapértelmezett összeg módosítása ne írja át a múltat. Idempotens; a beírt tervek számát adja.
 */
export async function migrateBasePlans(): Promise<number> {
  return db.transaction('rw', db.settings, db.categories, db.plans, async () => {
    const settings = await db.settings.get('settings');
    if (!settings) return 0;
    const missing = missingBasePlans(await db.categories.toArray(), await db.plans.toArray(), settings.firstPeriodId);
    await db.plans.bulkPut(missing);
    return missing.length;
  });
}

export async function updateSettings(patch: Partial<Omit<Settings, 'id'>>) {
  await db.settings.update('settings', patch);
}

/**
 * A beállítások mentése. Fizetésnap-változásnál a már érvénytelen kezdőnap-felülírások törlődnek, különben
 * időszakok csúsznának össze. Visszaadja a korábbi beállításokat és a törölt felülírásokat a visszavonáshoz.
 */
export async function saveBasicSettings(patch: Partial<Omit<Settings, 'id'>>) {
  return db.transaction('rw', db.settings, db.periodOverrides, async () => {
    const before = await db.settings.get('settings');
    if (!before) throw new Error('Hiányoznak a beállítások.');
    let removed: PeriodOverride[] = [];
    if (patch.payday !== undefined && patch.payday !== before.payday) {
      removed = invalidOverrides(await db.periodOverrides.toArray(), patch.payday);
      await db.periodOverrides.bulkDelete(removed.map((o) => o.periodId));
    }
    await db.settings.update('settings', patch);
    return { before, removed };
  });
}

/** Visszavonás: a beállításokat és a törölt kezdőnap-felülírásokat visszaállítja. */
export async function restoreSettings(before: Settings, overrides: PeriodOverride[] = []) {
  await db.transaction('rw', db.settings, db.periodOverrides, async () => {
    await db.settings.put(before);
    await db.periodOverrides.bulkPut(overrides);
  });
}

// --- Rögzítés -------------------------------------------------------------

export async function addEntry(
  periodId: PeriodId,
  categoryId: string,
  amount: number,
  date: ISODate,
  note?: string,
  kind?: Entry['kind'],
  settles?: boolean,
) {
  const e = entryRecord(periodId, categoryId, amount, date, note, kind, settles);
  await db.entries.add(e);
  return e;
}

function entryRecord(
  periodId: PeriodId,
  categoryId: string,
  amount: number,
  date: ISODate,
  note?: string,
  kind?: Entry['kind'],
  settles?: boolean,
): Entry {
  // 0 Ft-os rögzítés csak lezárásként értelmes (havi zárás: „Nem volt”).
  if (!Number.isInteger(amount) || amount < 0 || (amount === 0 && !settles)) throw new Error('Érvénytelen összeg.');
  return {
    id: newId(), periodId, categoryId, amount, date, note, kind,
    settles: settles && kind !== 'withdrawal' ? true : undefined,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Lezáró rögzítés fix tételhez („Kifizetve”, „Maradék”, „Más összeg”, „Nem volt”): utána a tétel kész,
 * akkor is, ha a tény eltér a tervtől. Visszavonás: restoreEntries([], [e.id]).
 */
export async function addSettlingEntry(periodId: PeriodId, categoryId: string, amount: number, date: ISODate, note?: string) {
  return addEntry(periodId, categoryId, amount, date, note, undefined, true);
}

/**
 * „Kész, több nem lesz”: a legutolsó rögzítésre teszi a lezárás jelzőt. A módosított rögzítés korábbi
 * állapotát adja vissza a visszavonáshoz (restoreEntries([előtte])); null, ha nincs mit lezárni.
 */
export async function markSettled(periodId: PeriodId, categoryId: string): Promise<Entry | null> {
  return db.transaction('rw', db.entries, async () => {
    const list = await entriesOf(periodId, categoryId);
    if (list.length === 0 || list.some((e) => e.settles)) return null;
    const last = list.reduce((a, b) => (b.createdAt > a.createdAt ? b : a));
    await db.entries.put({ ...last, settles: true });
    return last;
  });
}

/** A lezárás visszavétele (a rögzítések megmaradnak); a módosítottak korábbi állapotát adja vissza. */
export async function unsettle(periodId: PeriodId, categoryId: string): Promise<Entry[]> {
  return db.transaction('rw', db.entries, async () => {
    const settled = (await entriesOf(periodId, categoryId)).filter((e) => e.settles);
    await db.entries.bulkPut(settled.map(({ settles: _, ...rest }) => rest));
    return settled;
  });
}

/** A kategória befizetései/rögzítései az időszakban (a megtakarításból való felhasználás nélkül). */
export async function entriesOf(periodId: PeriodId, categoryId: string) {
  const all = await db.entries.where('[periodId+categoryId]').equals([periodId, categoryId]).toArray();
  return all.filter((e) => e.kind !== 'withdrawal');
}

/** A kategória összes rögzítését egyetlen havi összegre cseréli. Visszaadja a törölteket a visszavonáshoz. */
export async function setMonthlyTotal(periodId: PeriodId, categoryId: string, amount: number, date: ISODate) {
  return db.transaction('rw', db.entries, async () => {
    const old = await entriesOf(periodId, categoryId);
    await db.entries.bulkDelete(old.map((e) => e.id));
    const created: Entry = { ...entryRecord(periodId, categoryId, amount, date), monthlyTotal: true };
    await db.entries.add(created);
    return { old, created };
  });
}

/** Törli a kategória rögzítéseit az időszakban; a törölteket visszaadja a visszavonáshoz. */
export async function clearEntries(periodId: PeriodId, categoryId: string) {
  return db.transaction('rw', db.entries, async () => {
    const old = await entriesOf(periodId, categoryId);
    await db.entries.bulkDelete(old.map((e) => e.id));
    return old;
  });
}

export async function deleteEntry(id: string) {
  const e = await db.entries.get(id);
  await db.entries.delete(id);
  return e;
}

/** Visszavonás: a megadott rögzítéseket visszaállítja, az újonnan hozzáadottakat törli. */
export async function restoreEntries(restore: Entry[], removeIds: string[] = []) {
  await db.transaction('rw', db.entries, async () => {
    await db.entries.bulkDelete(removeIds);
    await db.entries.bulkPut(restore);
  });
}

// --- Terv -----------------------------------------------------------------

/** Visszaadja a kategória korábbi terveit a visszavonáshoz (restorePlansOf). */
export async function changePlan(cat: Category, periodId: PeriodId, amount: number, mode: PlanMode): Promise<Plan[]> {
  return db.transaction('rw', db.plans, async () => {
    const own = await db.plans.where('categoryId').equals(cat.id).toArray();
    const ops = planChangeOps(own, cat, periodId, amount, mode);
    await db.plans.bulkDelete(ops.del.map((d) => [d.periodId, d.categoryId] as [string, string]));
    await db.plans.bulkPut(ops.put);
    return own;
  });
}

/** Visszavonás: a kategória terveit a pillanatképre állítja. */
export async function restorePlansOf(categoryId: string, plans: Plan[]) {
  await db.transaction('rw', db.plans, async () => {
    await db.plans.where('categoryId').equals(categoryId).delete();
    await db.plans.bulkPut(plans);
  });
}

/**
 * Fedezet áthozása egyik keretből a másikba: két „csak erre a hónapra” tervmódosítás egy tranzakcióban. A forrás
 * maradékát a tárolt adatokból számolja, hogy a forrás ne kerülhessen túllépésbe. Visszaadja a művelet leírását
 * a visszavonáshoz (undoMoveCover).
 */
export async function moveCover(from: Category, to: Category, periodId: PeriodId, amount: number): Promise<CoverChange> {
  return db.transaction('rw', db.settings, db.plans, db.entries, async () => {
    const settings = await db.settings.get('settings');
    const own = await db.plans.where('categoryId').anyOf(from.id, to.id).toArray();
    const spent = (await entriesOf(periodId, from.id)).reduce((s, e) => s + e.amount, 0);
    const { ops, change } = coverOps(own, from, to, periodId, amount, spent, settings?.firstPeriodId);
    await db.plans.bulkDelete(ops.del.map((d) => [d.periodId, d.categoryId] as [string, string]));
    await db.plans.bulkPut(ops.put);
    return change;
  });
}

/** Visszavonás: csak ezt az egy áthozást vonja vissza, a közben történt többi tervmódosítás megmarad. */
export async function undoMoveCover(change: CoverChange) {
  await db.transaction('rw', db.settings, db.categories, db.plans, async () => {
    const settings = await db.settings.get('settings');
    const [from, to] = await db.categories.bulkGet([change.fromId, change.toId]);
    if (!from || !to) throw new Error('A keret már nem létezik.');
    const own = await db.plans.where('categoryId').anyOf(from.id, to.id).toArray();
    const ops = uncoverOps(own, from, to, change, settings?.firstPeriodId);
    await db.plans.bulkDelete(ops.del.map((d) => [d.periodId, d.categoryId] as [string, string]));
    await db.plans.bulkPut(ops.put);
  });
}

export async function snapshotPlans() {
  return db.plans.toArray();
}

export async function replacePlans(plans: Plan[]) {
  await db.transaction('rw', db.plans, async () => {
    await db.plans.clear();
    await db.plans.bulkPut(plans);
  });
}

// --- Kategóriák -----------------------------------------------------------

export async function saveCategory(c: Category) {
  await db.categories.put(c);
}

/**
 * Új kategória (a varázslón kívül): a mostani időszaktól (ha a költségvetés még nem indult el, az elsőtől)
 * az alapösszeg a terve, a korábbiakban 0.
 */
export async function addCategory(c: Category, currentId: PeriodId) {
  await db.transaction('rw', db.settings, db.categories, db.plans, async () => {
    const settings = await db.settings.get('settings');
    await db.categories.put(c);
    if (settings) await db.plans.bulkPut(newCategoryPlans(c, settings.firstPeriodId, currentId));
  });
}

/**
 * Meglévő kategória mentése. Az alapértelmezett összeg csak sablon: módosításakor a mostani időszaktól
 * (ha a költségvetés még nem indult el, az elsőtől) érvényes terv lesz belőle („ettől a hónaptól”), a múltbeli
 * tervek nem változnak. Visszaadja a kategória korábbi terveit a visszavonáshoz (restoreCategory), és hogy
 * melyik időszaktól hat a módosítás.
 */
export async function updateCategory(prev: Category, next: Category, currentId: PeriodId) {
  return db.transaction('rw', [db.settings, db.categories, db.plans, db.entries], async () => {
    if (prev.type !== next.type) {
      const used = (await db.entries.where('categoryId').equals(prev.id).count()) > 0;
      if (!allowedTypes(prev, used).includes(next.type)) throw new Error('A típus nem módosítható, mert a kategóriának már van rögzítése.');
    }
    const settings = await db.settings.get('settings');
    const fromId = settings ? planStartId(currentId, settings.firstPeriodId) : currentId;
    const own = await db.plans.where('categoryId').equals(next.id).toArray();
    await db.categories.put(next);
    const amountChanged = prev.defaultAmount !== next.defaultAmount;
    if (amountChanged) {
      const ops = planChangeOps(own, next, fromId, next.defaultAmount, 'from');
      await db.plans.bulkDelete(ops.del.map((d) => [d.periodId, d.categoryId] as [string, string]));
      await db.plans.bulkPut(ops.put);
    }
    return { plansBefore: own, amountChanged, fromId };
  });
}

/** Visszavonás: a kategóriát és a terveit a mentés előtti állapotra állítja. */
export async function restoreCategory(c: Category, plans: Plan[]) {
  await db.transaction('rw', db.categories, db.plans, async () => {
    await db.categories.put(c);
    await db.plans.where('categoryId').equals(c.id).delete();
    await db.plans.bulkPut(plans);
  });
}

export async function reorderCategories(ids: string[]) {
  await db.transaction('rw', db.categories, async () => {
    await Promise.all(ids.map((id, order) => db.categories.update(id, { order })));
  });
}

// --- Időszakok ------------------------------------------------------------

export async function setOverride(o: PeriodOverride) {
  await db.periodOverrides.put(o);
}

export async function clearOverride(periodId: PeriodId) {
  await db.periodOverrides.delete(periodId);
}

// --- Mentés, visszatöltés -------------------------------------------------

/** A fájlt előbb a parseImport-tal kell ellenőrizni; adatbázishibánál a tranzakció visszagördül és dob. */
export async function importAll(f: ExportFile) {
  await db.transaction('rw', [db.settings, db.categories, db.plans, db.entries, db.periodOverrides], async () => {
    await Promise.all([db.settings.clear(), db.categories.clear(), db.plans.clear(), db.entries.clear(), db.periodOverrides.clear()]);
    await db.settings.put({ ...f.settings, id: 'settings', lastExportAt: f.exportedAt });
    await db.categories.bulkPut(f.categories);
    await db.plans.bulkPut([...f.plans, ...missingBasePlans(f.categories, f.plans, f.settings.firstPeriodId)]);
    await db.entries.bulkPut(f.entries);
    await db.periodOverrides.bulkPut(f.periodOverrides);
  });
}

export async function wipeAll() {
  await db.transaction('rw', [db.settings, db.categories, db.plans, db.entries, db.periodOverrides], async () => {
    await Promise.all([db.settings.clear(), db.categories.clear(), db.plans.clear(), db.entries.clear(), db.periodOverrides.clear()]);
  });
}

/** Tartós tárolás kérése, hogy a böngésző ne törölje az adatokat helyhiány esetén. */
export async function requestPersistence(): Promise<boolean | null> {
  if (!navigator.storage?.persist) return null;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}

/** A váratlan kiadások kategóriája; ha még nincs (régebbi költségvetés), létrehozza, ha archivált, visszaállítja. */
export async function ensureUnexpectedCategory(): Promise<Category> {
  return db.transaction('rw', db.settings, db.categories, db.plans, async () => {
    const all = await db.categories.toArray();
    const found = all.find((c) => c.role === 'unexpected');
    if (found) {
      if (found.archived) await db.categories.update(found.id, { archived: false });
      return { ...found, archived: false };
    }
    const c = unexpectedCategory(Math.max(0, ...all.map((x) => x.order)) + 1);
    await db.categories.add(c);
    // Az alapösszege 0, ezért egyetlen 0-s terv az első időszakon elég (a múltban sem volt terve).
    const settings = await db.settings.get('settings');
    if (settings) await db.plans.bulkPut(missingBasePlans([c], [], settings.firstPeriodId));
    return c;
  });
}
