import type { BudgetData, Settings } from './types';

/**
 * Közös használat (több eszköz egy költségvetésen): háromutas összefésülés. Az alap a legutóbbi közös
 * állapot (amit ez az eszköz utoljára szinkronizált), a helyi és a távoli az azóta módosult két változat.
 * Rekordonként: amit csak az egyik oldal változtatott (hozzáadott, módosított vagy törölt), az érvényes;
 * ha mindkettő ugyanúgy, az is. Ha mindkettő másként, a módosítás erősebb a törlésnél (ne vesszen el adat),
 * két módosítás közül a helyi nyer. Így a rögzítések – mindegyiknek saját azonosítója van – sosem ütköznek.
 */

/** Eszközönkénti beállítások: nem szinkronizálódnak, mindig a helyi érték marad. */
export const LOCAL_SETTINGS_FIELDS = ['lastExportAt', 'lastSeenPeriodId'] as const satisfies readonly (keyof Settings)[];

type Rec = Record<string, unknown>;

/** Kulcssorrendtől független, az undefined mezőket elhagyó szöveges alak az összehasonlításhoz. */
export function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? 'null' : stableStringify(x))).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Rec;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

const same = (a: unknown, b: unknown) => stableStringify(a) === stableStringify(b);

/** Egy döntés három változatból; undefined: a rekord nincs (vagy törölve lett). */
function pick<T>(base: T | undefined, local: T | undefined, remote: T | undefined): T | undefined {
  if (same(local, remote)) return local;
  if (same(local, base)) return remote;
  if (same(remote, base)) return local;
  // Mindkét oldal másként változtatott: a törlés enged a módosításnak, két módosításból a helyi marad.
  return local ?? remote;
}

function mergeList<T>(key: (x: T) => string, base: T[], local: T[], remote: T[]): T[] {
  const b = new Map(base.map((x) => [key(x), x]));
  const l = new Map(local.map((x) => [key(x), x]));
  const r = new Map(remote.map((x) => [key(x), x]));
  const out: T[] = [];
  // A helyi sorrend marad, a csak távol létezők a végére kerülnek.
  for (const k of new Set([...l.keys(), ...r.keys()])) {
    const v = pick(b.get(k), l.get(k), r.get(k));
    if (v !== undefined) out.push(v);
  }
  return out;
}

/** A beállítások közös része (az eszközönkénti mezők nélkül). */
export function sharedSettings(s: Settings): Omit<Settings, (typeof LOCAL_SETTINGS_FIELDS)[number]> {
  const out = { ...s } as Rec;
  for (const f of LOCAL_SETTINGS_FIELDS) delete out[f];
  return out as Omit<Settings, (typeof LOCAL_SETTINGS_FIELDS)[number]>;
}

function mergeSettings(base: Settings | undefined, local: Settings, remote: Settings): Settings {
  const b = (base ? sharedSettings(base) : {}) as Rec;
  const l = sharedSettings(local) as Rec;
  const r = sharedSettings(remote) as Rec;
  const out: Rec = {};
  for (const k of new Set([...Object.keys(l), ...Object.keys(r)])) {
    const v = pick(b[k], l[k], r[k]);
    if (v !== undefined) out[k] = v;
  }
  for (const f of LOCAL_SETTINGS_FIELDS) if (local[f] !== undefined) out[f] = local[f];
  return { ...(out as unknown as Settings), id: 'settings' };
}

export const planKey = (p: { periodId: string; categoryId: string }) => `${p.periodId}|${p.categoryId}`;

/**
 * A helyi és a távoli változat összefésülése a közös alaphoz képest. Alap nélkül (első összekapcsolás vagy
 * elveszett alap) mindkét oldal minden rekordja megmarad, eltérésnél a helyi.
 */
export function mergeData(base: BudgetData | null, local: BudgetData, remote: BudgetData): BudgetData {
  const b = base ?? { settings: undefined, categories: [], plans: [], entries: [], overrides: [] };
  return {
    settings: mergeSettings(b.settings, local.settings, remote.settings),
    categories: mergeList((c) => c.id, b.categories, local.categories, remote.categories),
    plans: mergeList(planKey, b.plans, local.plans, remote.plans),
    entries: mergeList((e) => e.id, b.entries, local.entries, remote.entries),
    overrides: mergeList((o) => o.periodId, b.overrides, local.overrides, remote.overrides),
  };
}

/** Rekordhalmazként (sorrendtől és az eszközönkénti beállításoktól függetlenül) azonos-e a két változat. */
export function sameData(a: BudgetData, b: BudgetData): boolean {
  const set = <T>(l: T[], key: (x: T) => string) => [...l].sort((x, y) => key(x).localeCompare(key(y))).map(stableStringify);
  return (
    same(sharedSettings(a.settings), sharedSettings(b.settings)) &&
    same(set(a.categories, (c) => c.id), set(b.categories, (c) => c.id)) &&
    same(set(a.plans, planKey), set(b.plans, planKey)) &&
    same(set(a.entries, (e) => e.id), set(b.entries, (e) => e.id)) &&
    same(set(a.overrides, (o) => o.periodId), set(b.overrides, (o) => o.periodId))
  );
}

/** A szinkron commit üzenete, pl. „Anna: 3 új rögzítés, 1 törölve”. */
export function changeSummary(before: BudgetData | null, after: BudgetData, who: string): string {
  if (!before) return `${who}: első feltöltés`;
  const ids = new Set(before.entries.map((e) => e.id));
  const now = new Set(after.entries.map((e) => e.id));
  const added = after.entries.filter((e) => !ids.has(e.id)).length;
  const removed = before.entries.filter((e) => !now.has(e.id)).length;
  const parts = [added && `${added} új rögzítés`, removed && `${removed} törölve`].filter(Boolean);
  return `${who}: ${parts.length ? parts.join(', ') : 'módosítás'}`;
}
