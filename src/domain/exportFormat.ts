import type { Summaries } from './balance';
import { PERIOD_ID_RE, periodDistance, periodIdOf, periodName } from './periods';
import { TYPE_LABEL } from './defaults';
import type { BudgetData, Category, CategoryType, Entry, Plan, PeriodOverride, Settings } from './types';

export const APP_ID = 'csaladi-koltsegvetes';
export const SCHEMA_VERSION = 1;

export interface ExportFile {
  app: typeof APP_ID;
  schemaVersion: number;
  exportedAt: string;
  settings: Settings;
  periodOverrides: PeriodOverride[];
  categories: Category[];
  plans: Plan[];
  entries: Entry[];
}

export interface ImportPreview {
  periods: number;
  categories: number;
  entries: number;
  exportedAt: string;
  lastChange: string | null;
}

export function buildExport(data: BudgetData, now = new Date()): ExportFile {
  return {
    app: APP_ID,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    settings: data.settings,
    periodOverrides: data.overrides,
    categories: data.categories,
    plans: data.plans,
    entries: data.entries,
  };
}

export function exportFileName(now = new Date(), kind = ''): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `csaladi-koltsegvetes-${kind ? `${kind}-` : ''}${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.json`;
}

/**
 * Vészmentés a hibaképernyőről: a táblák nyers tartalma az export formátumában, számolás és ellenőrzés
 * nélkül, hogy sérült adatnál is letölthető legyen (a hiányzó beállítás null marad).
 */
export function rawExport(
  t: { settings?: unknown; categories: unknown[]; plans: unknown[]; entries: unknown[]; overrides: unknown[] },
  now = new Date(),
) {
  return {
    app: APP_ID,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    settings: t.settings ?? null,
    periodOverrides: t.overrides,
    categories: t.categories,
    plans: t.plans,
    entries: t.entries,
  };
}

const isArr = (v: unknown): v is unknown[] => Array.isArray(v);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export type ExportMigration = (f: Record<string, unknown>) => Record<string, unknown>;

/**
 * Sémaverzió-lépések: a kulcs a kiinduló verzió, a függvény a következő verzióra alakít.
 * Minden sémaváltáskor ide kerül egy új lépés, így a régi mentések is betölthetők maradnak.
 */
export const MIGRATIONS: Record<number, ExportMigration> = {};

/** A régebbi sémaverziójú mentést lépésenként a jelenlegire alakítja. */
export function migrateExport(
  raw: Record<string, unknown>,
  migrations: Record<number, ExportMigration> = MIGRATIONS,
  target: number = SCHEMA_VERSION,
): Record<string, unknown> {
  let v = raw.schemaVersion;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) throw new Error('A mentés sémaverziója ismeretlen.');
  if (v > target) throw new Error('A mentés egy újabb verzióból származik, ez a verzió nem tudja betölteni.');
  let f = raw;
  for (; v < target; v++) {
    const step = migrations[v];
    if (!step) throw new Error(`A ${v}. sémaverziójú mentést ez a verzió nem tudja átalakítani.`);
    f = { ...step(f), schemaVersion: v + 1 };
  }
  return f;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/**
 * Az első időszak ésszerű tartománya a mai naptól. Egy ennél régebbi (sérült vagy kézzel írt) érték mellett
 * az időszakok listája a biztonsági korlátba ütközne, és a mostani időszak kimaradna belőle.
 */
const FIRST_PERIOD_MAX_AGE = 50 * 12;
const FIRST_PERIOD_MAX_AHEAD = 2 * 12;
const TYPES: readonly CategoryType[] = ['fix', 'keret', 'bevetel', 'megtakaritas'];

/** Szám vagy számot tartalmazó szöveg (kézzel szerkesztett fájlban előfordul); más esetben null. */
function num(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && /^\s*-?\d+(\.\d+)?\s*$/.test(v)) return Number(v);
  return null;
}

/** Nemnegatív, egész forintra kerekített összeg; null, ha érvénytelen. */
function amountOf(v: unknown): number | null {
  const n = num(v);
  return n === null || n < 0 ? null : Math.round(n);
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v : undefined);

/** Az undefined értékű mezőket elhagyja, hogy a tárolt rekord ne kapjon üres kulcsokat. */
function clean<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

/**
 * Rekordszintű ellenőrzés és normalizálás. A hiányzó, de pótolható mezők alapértéket kapnak
 * (előrejelzés 6, nyitó egyenleg 0, archivált nem, sorrend a helye szerint), az összegek egész forintra
 * kerekednek. A nem pótolható hibáknál magyar nyelvű üzenettel dob, amely megmondja, mi és hol hibás.
 * Az ismeretlen (újabb, de azonos sémaverziójú) mezőket megtartja.
 */
export function normalizeExport(f: Record<string, unknown>, now = new Date()): ExportFile {
  const errors: string[] = [];
  const bad = (where: string, what: string) => errors.push(`${where}: ${what}`);
  const exportedAt = str(f.exportedAt) ?? now.toISOString();

  const s = f.settings;
  if (!isObj(s)) throw new Error('A mentésből hiányoznak a beállítások.');
  if (!isArr(f.categories) || !isArr(f.plans) || !isArr(f.entries) || !isArr(f.periodOverrides)) {
    throw new Error('A mentés hiányos.');
  }

  const payday = num(s.payday);
  if (payday === null || !Number.isInteger(payday) || payday < 1 || payday > 31) {
    bad('Beállítások', 'a fizetésnap 1 és 31 közötti egész szám lehet');
  }
  const firstPeriodId = typeof s.firstPeriodId === 'string' && PERIOD_ID_RE.test(s.firstPeriodId) ? s.firstPeriodId : null;
  if (!firstPeriodId) bad('Beállítások', 'az első időszak azonosítója érvénytelen (ÉÉÉÉ-HH formában kell)');
  else {
    const age = periodDistance(firstPeriodId, periodIdOf(now.getFullYear(), now.getMonth()));
    if (age > FIRST_PERIOD_MAX_AGE) bad('Beállítások', `az első időszak (${periodName(firstPeriodId, true)}) túl régi`);
    if (-age > FIRST_PERIOD_MAX_AHEAD) bad('Beállítások', `az első időszak (${periodName(firstPeriodId, true)}) túl messze van a jövőben`);
  }
  const opening = s.openingBalance === undefined || s.openingBalance === null ? 0 : num(s.openingBalance);
  if (opening === null) bad('Beállítások', 'a nyitó egyenleg nem szám');
  const forecast = s.forecastPeriods === undefined || s.forecastPeriods === null ? 6 : num(s.forecastPeriods);
  if (forecast === null) bad('Beállítások', 'az előrejelzés hossza nem szám');
  const settings: Settings = clean({
    ...(s as Partial<Settings>),
    id: 'settings' as const,
    payday: payday ?? 1,
    openingBalance: Math.round(opening ?? 0),
    firstPeriodId: firstPeriodId ?? '',
    forecastPeriods: Math.min(24, Math.max(1, Math.round(forecast ?? 6))),
    lastExportAt: str(s.lastExportAt),
    lastSeenPeriodId: typeof s.lastSeenPeriodId === 'string' && PERIOD_ID_RE.test(s.lastSeenPeriodId) ? s.lastSeenPeriodId : undefined,
    createdAt: str(s.createdAt) ?? exportedAt,
  });

  const categories: Category[] = [];
  const catIds = new Set<string>();
  f.categories.forEach((c, i) => {
    const name = isObj(c) ? str(c.name)?.trim() : undefined;
    const where = `${i + 1}. kategória${name ? ` („${name}”)` : ''}`;
    if (!isObj(c)) return bad(where, 'nem érvényes rekord');
    const id = str(c.id);
    if (!id) return bad(where, 'hiányzik az azonosító');
    if (catIds.has(id)) return bad(where, 'az azonosító ismétlődik');
    catIds.add(id);
    if (!name) bad(where, 'hiányzik a név');
    const type = TYPES.find((t) => t === c.type);
    if (!type) bad(where, `ismeretlen típus (${String(c.type)})`);
    const defaultAmount = c.defaultAmount === undefined || c.defaultAmount === null ? 0 : amountOf(c.defaultAmount);
    if (defaultAmount === null) bad(where, 'az alapértelmezett összeg érvénytelen');
    const dueDay = num(c.dueDay);
    const goalAmount = amountOf(c.goalAmount);
    const goalStart = amountOf(c.goalStart);
    categories.push(clean({
      ...(c as Partial<Category>),
      id,
      name: name ?? '',
      icon: str(c.icon) ?? 'dots',
      color: str(c.color) ?? '#888780',
      type: type ?? 'keret',
      group: str(c.group)?.trim(),
      defaultAmount: defaultAmount ?? 0,
      dueDay: dueDay !== null && Number.isInteger(dueDay) && dueDay >= 1 && dueDay <= 31 ? dueDay : undefined,
      incomeMode: c.incomeMode === 'fix' || c.incomeMode === 'keret' ? c.incomeMode : undefined,
      goalAmount: goalAmount !== null && goalAmount > 0 ? goalAmount : undefined,
      goalDeadline: typeof c.goalDeadline === 'string' && PERIOD_ID_RE.test(c.goalDeadline) ? c.goalDeadline : undefined,
      goalStart: goalStart ?? undefined,
      role: c.role === 'unexpected' ? ('unexpected' as const) : undefined,
      excludeFromDaily: typeof c.excludeFromDaily === 'boolean' ? c.excludeFromDaily : undefined,
      order: num(c.order) ?? i,
      archived: typeof c.archived === 'boolean' ? c.archived : false,
    }));
  });

  const periodOf = (v: unknown) => (typeof v === 'string' && PERIOD_ID_RE.test(v) ? v : null);

  // Ismétlődő kulcsnál (időszak + kategória) a későbbi rekord érvényes, ahogy az adatbázisban is.
  const plans = new Map<string, Plan>();
  f.plans.forEach((p, i) => {
    const where = `${i + 1}. terv`;
    if (!isObj(p)) return bad(where, 'nem érvényes rekord');
    const periodId = periodOf(p.periodId);
    if (!periodId) return bad(where, 'az időszak azonosítója érvénytelen');
    if (typeof p.categoryId !== 'string' || !catIds.has(p.categoryId)) return bad(where, 'ismeretlen kategóriára hivatkozik');
    const amount = amountOf(p.amount);
    if (amount === null) return bad(where, 'az összeg érvénytelen');
    plans.set(`${periodId}|${p.categoryId}`, { periodId, categoryId: p.categoryId, amount });
  });

  const entries: Entry[] = [];
  const entryIds = new Set<string>();
  f.entries.forEach((e, i) => {
    const where = `${i + 1}. rögzítés`;
    if (!isObj(e)) return bad(where, 'nem érvényes rekord');
    const id = str(e.id);
    if (!id) return bad(where, 'hiányzik az azonosító');
    if (entryIds.has(id)) return bad(where, 'az azonosító ismétlődik');
    entryIds.add(id);
    const periodId = periodOf(e.periodId);
    if (!periodId) return bad(where, 'az időszak azonosítója érvénytelen');
    if (typeof e.categoryId !== 'string' || !catIds.has(e.categoryId)) return bad(where, 'ismeretlen kategóriára hivatkozik');
    const amount = amountOf(e.amount);
    if (amount === null) return bad(where, `az összeg érvénytelen (${JSON.stringify(e.amount) ?? 'hiányzik'})`);
    if (typeof e.date !== 'string' || !ISO_DATE_RE.test(e.date)) return bad(where, 'a dátum érvénytelen (ÉÉÉÉ-HH-NN formában kell)');
    if (e.kind !== undefined && e.kind !== null && e.kind !== 'withdrawal') return bad(where, `ismeretlen fajta (${String(e.kind)})`);
    entries.push(clean({
      ...(e as Partial<Entry>),
      id,
      periodId,
      categoryId: e.categoryId,
      amount,
      date: e.date,
      note: str(e.note),
      kind: e.kind === 'withdrawal' ? ('withdrawal' as const) : undefined,
      settles: e.settles === true ? (true as const) : undefined,
      monthlyTotal: e.monthlyTotal === true ? (true as const) : undefined,
      createdAt: str(e.createdAt) ?? exportedAt,
      createdBy: str(e.createdBy)?.trim(),
      // Ismeretlen kategóriára mutató hivatkozás nem hiba: a felhasználás megmarad, csak kiadásként nem látszik.
      spendCategoryId: e.kind === 'withdrawal' && typeof e.spendCategoryId === 'string' && catIds.has(e.spendCategoryId) ? e.spendCategoryId : undefined,
    }));
  });

  const overrides = new Map<string, PeriodOverride>();
  f.periodOverrides.forEach((o, i) => {
    const where = `${i + 1}. kezdőnap-felülírás`;
    if (!isObj(o)) return bad(where, 'nem érvényes rekord');
    const periodId = periodOf(o.periodId);
    if (!periodId) return bad(where, 'az időszak azonosítója érvénytelen');
    if (typeof o.startDate !== 'string' || !ISO_DATE_RE.test(o.startDate)) return bad(where, 'a kezdőnap érvénytelen');
    overrides.set(periodId, { periodId, startDate: o.startDate });
  });

  if (errors.length) {
    const more = errors.length > 3 ? ` (és még ${errors.length - 3} hiba)` : '';
    throw new Error(`A mentés hibás, ezért nem tölthető be. ${errors.slice(0, 3).join('. ')}.${more}`);
  }

  return {
    app: APP_ID,
    schemaVersion: SCHEMA_VERSION,
    exportedAt,
    settings,
    periodOverrides: [...overrides.values()],
    categories,
    plans: [...plans.values()],
    entries,
  };
}

/** Ellenőrzi és normalizálja a beolvasott fájlt; hibánál magyar nyelvű üzenettel dob. */
export function parseImport(text: string, now = new Date()): ExportFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('A fájl nem érvényes JSON.');
  }
  if (!isObj(raw) || raw.app !== APP_ID) throw new Error('Ez nem a családi költségvetés mentése.');
  return normalizeExport(migrateExport(raw), now);
}

export function previewImport(f: ExportFile): ImportPreview {
  const periods = new Set([...f.entries.map((e) => e.periodId), ...f.plans.map((p) => p.periodId)]);
  const lastChange = f.entries.reduce<string | null>((m, e) => (m === null || e.createdAt > m ? e.createdAt : m), null);
  return {
    periods: periods.size,
    categories: f.categories.filter((c) => !c.archived).length,
    entries: f.entries.length,
    exportedAt: f.exportedAt,
    lastChange,
  };
}

/** Pontosvesszővel tagolt, BOM-os UTF-8 CSV, hogy a magyar Excel helyesen nyissa meg. */
export function buildCsv(data: BudgetData, s: Summaries): string {
  const esc = (v: string | number) => {
    const t = String(v);
    return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const rows: (string | number)[][] = [['Időszak', 'Kezdete', 'Vége', 'Csoport', 'Kategória', 'Típus', 'Terv', 'Tény']];
  const cats = [...data.categories].sort((a, b) => a.order - b.order);
  for (const p of s.periods) {
    if (p.status === 'future') continue;
    for (const c of cats) {
      const f = p.byCategory.get(c.id);
      if (!f) continue;
      rows.push([periodName(p.id, true), p.start, p.end, c.group ?? '', c.name, TYPE_LABEL[c.type], f.plan, f.actual]);
    }
  }
  return '﻿' + rows.map((r) => r.map(esc).join(';')).join('\r\n');
}
