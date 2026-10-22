import type { PeriodSummary, Summaries } from './balance';
import { isExpense, type Category, type Entry, type PeriodId } from './types';

/**
 * Az Elemzés számításai. A kimutatások csak a lezárt és a folyamatban lévő időszakokat nézik (a jövő csak terv).
 * A megtakarításból fizetett költés (`withdrawal` + `spendCategoryId`) a választott kategória kiadásaként külön
 * oszlopban jelenik meg; a tervhez mért eltérésbe nem számít bele, mert nem a havi pénzből ment el.
 */

export type AnalysisRange = 'period' | 'last12' | 'year';

/** A hőtérkép ennyi időszakot mutat „Ez az időszak” módban (a választottal bezárólag). */
export const HEAT_PERIODS_SHORT = 6;

const eligible = (s: Summaries) => s.periods.filter((p) => p.status !== 'future');

/** A választott időszak; jövőbelinél a mostani, mert annak még nincs ténye. */
export function anchorPeriod(s: Summaries, selectedId: PeriodId): PeriodSummary {
  const p = s.byId.get(selectedId);
  return p && p.status !== 'future' ? p : s.byId.get(s.currentId)!;
}

/** Az időablak időszakai, időrendben. */
export function rangePeriods(s: Summaries, selectedId: PeriodId, range: AnalysisRange): PeriodSummary[] {
  const anchor = anchorPeriod(s, selectedId);
  const upTo = eligible(s).filter((p) => p.id <= anchor.id);
  if (range === 'period') return [anchor];
  if (range === 'last12') return upTo.slice(-12);
  return eligible(s).filter((p) => p.id.slice(0, 4) === anchor.id.slice(0, 4));
}

/** A hőtérkép oszlopai: „Ez az időszak” módban az utolsó néhány időszak, egyébként az időablak. */
export function heatPeriods(s: Summaries, selectedId: PeriodId, range: AnalysisRange): PeriodSummary[] {
  if (range !== 'period') return rangePeriods(s, selectedId, range);
  const anchor = anchorPeriod(s, selectedId);
  return eligible(s).filter((p) => p.id <= anchor.id).slice(-HEAT_PERIODS_SHORT);
}

/** Megtakarításból fizetett költés kategóriánként és időszakonként: kategória → időszak → összeg. */
export function savingsSpend(entries: Entry[]): Map<string, Map<PeriodId, number>> {
  const out = new Map<string, Map<PeriodId, number>>();
  for (const e of entries) {
    if (e.kind !== 'withdrawal' || !e.spendCategoryId) continue;
    let m = out.get(e.spendCategoryId);
    if (!m) out.set(e.spendCategoryId, (m = new Map()));
    m.set(e.periodId, (m.get(e.periodId) ?? 0) + e.amount);
  }
  return out;
}

export interface SpendRow {
  cat: Category;
  plan: number;
  /** A havi pénzből (a tervhez mérhető rész). */
  actual: number;
  /** Megtakarításból fizetve. */
  fromSavings: number;
}

/** „Hova ment a pénz”: kiadási kategóriánként terv, tény és megtakarításból fizetett rész, a költés szerint csökkenőn. */
export function spendingRows(categories: Category[], periods: PeriodSummary[], spend: Map<string, Map<PeriodId, number>>): SpendRow[] {
  const rows: SpendRow[] = [];
  for (const cat of categories) {
    if (!isExpense(cat)) continue;
    let plan = 0;
    let actual = 0;
    let fromSavings = 0;
    for (const p of periods) {
      const f = p.byCategory.get(cat.id);
      plan += f?.plan ?? 0;
      actual += f?.actual ?? 0;
      fromSavings += spend.get(cat.id)?.get(p.id) ?? 0;
    }
    if (plan > 0 || actual > 0 || fromSavings > 0) rows.push({ cat, plan, actual, fromSavings });
  }
  return rows.sort((a, b) => b.actual + b.fromSavings - (a.actual + a.fromSavings) || a.cat.order - b.cat.order);
}

export interface Deviation {
  cat: Category;
  plan: number;
  actual: number;
  /** Tény − terv; túllépésnél pozitív. */
  diff: number;
  kind: 'over' | 'under' | 'unplanned';
  /** Hány időszakban volt a terv fölött (terv nélkülinél: hányban költöttetek belőle). */
  periodsOver: number;
}

/** Ennél kisebb eltérés nem kerül a listába (forint, illetve a terv aránya). */
const MIN_DIFF = 1000;
const MIN_DIFF_RATIO = 0.05;

/**
 * A legnagyobb eltérések a tervtől, csak lezárt időszakokból: a folyamatban lévőben a „terv alatt” csak annyit
 * jelentene, hogy a hónap még nem ért véget. Csak a havi pénzből fizetett költés számít.
 */
export function deviations(categories: Category[], periods: PeriodSummary[], limit = 5): Deviation[] {
  const closed = periods.filter((p) => p.status === 'closed');
  const out: Deviation[] = [];
  for (const cat of categories) {
    if (!isExpense(cat)) continue;
    let plan = 0;
    let actual = 0;
    let periodsOver = 0;
    for (const p of closed) {
      const f = p.byCategory.get(cat.id);
      if (!f) continue;
      plan += f.plan;
      actual += f.actual;
      if (f.actual > f.plan) periodsOver++;
    }
    const diff = actual - plan;
    if (Math.abs(diff) < Math.max(MIN_DIFF, plan * MIN_DIFF_RATIO)) continue;
    const kind = plan === 0 ? 'unplanned' : diff > 0 ? 'over' : 'under';
    out.push({ cat, plan, actual, diff, kind, periodsOver });
  }
  return out.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)).slice(0, limit);
}

export type HeatTone = 'none' | 'current' | 'unplanned' | 'under' | 'ok' | 'over' | 'way-over';

/** A hőtérkép cellájának színe a tény/terv arány szerint: ≤ 90%, 90–100%, 100–115%, > 115%. */
export function heatTone(plan: number, actual: number, current: boolean): HeatTone {
  if (plan === 0 && actual === 0) return 'none';
  if (current) return 'current';
  if (plan === 0) return 'unplanned';
  const r = actual / plan;
  if (r <= 0.9) return 'under';
  if (r <= 1) return 'ok';
  if (r <= 1.15) return 'over';
  return 'way-over';
}

/** Rövid összeg a cellákba: „800”, „112e”, „1,2M”. */
export function shortAmount(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  if (a < 1000) return `${sign}${Math.round(a)}`;
  if (a < 999_500) return `${sign}${Math.round(a / 1000)}e`;
  return `${sign}${(a / 1_000_000).toFixed(1).replace('.', ',').replace(',0', '')}M`;
}

export interface TrendPoint {
  periodId: PeriodId;
  plan: number;
  actual: number;
  fromSavings: number;
  /** Az utolsó legfeljebb 3 lezárt időszak átlaga (ezzel bezárólag); a folyamatban lévőnél és adat nélkül null. */
  avg3: number | null;
  current: boolean;
}

/** Egy kategória (vagy csoport) trendje az időszakokon át. */
export function trendSeries(catIds: string[], periods: PeriodSummary[], spend: Map<string, Map<PeriodId, number>>): TrendPoint[] {
  const points = periods.map((p) => {
    let plan = 0;
    let actual = 0;
    let fromSavings = 0;
    for (const id of catIds) {
      const f = p.byCategory.get(id);
      plan += f?.plan ?? 0;
      actual += f?.actual ?? 0;
      fromSavings += spend.get(id)?.get(p.id) ?? 0;
    }
    return { periodId: p.id, plan, actual, fromSavings, avg3: null as number | null, current: p.status === 'current' };
  });
  points.forEach((pt, i) => {
    if (pt.current) return;
    const window = points.slice(Math.max(0, i - 2), i + 1).filter((x) => !x.current);
    pt.avg3 = Math.round(window.reduce((s, x) => s + x.actual, 0) / window.length);
  });
  return points;
}

// --- Címkék és kereső -------------------------------------------------------

const TAG_RE = /#([\p{L}\p{N}_-]+)/gu;

/** A megjegyzés #címkéi kisbetűsen, ismétlés nélkül. */
export function tagsOf(note: string | undefined): string[] {
  if (!note) return [];
  return [...new Set([...note.matchAll(TAG_RE)].map((m) => m[1].toLocaleLowerCase('hu')))];
}

export interface TagSummary {
  tag: string;
  total: number;
  count: number;
}

/** A címkék összesítése (összeg szerint csökkenőn); a megtakarításból fizetett költés is beleszámít. */
export function tagSummary(entries: Entry[]): TagSummary[] {
  const m = new Map<string, TagSummary>();
  for (const e of entries) {
    for (const tag of tagsOf(e.note)) {
      const t = m.get(tag) ?? { tag, total: 0, count: 0 };
      t.total += e.amount;
      t.count++;
      m.set(tag, t);
    }
  }
  return [...m.values()].sort((a, b) => b.total - a.total || a.tag.localeCompare(b.tag, 'hu'));
}

/**
 * Keresés a rögzítésekben, a legújabbtól. „#címke” keresésnél pontos címkeegyezés, egyébként a megjegyzésben,
 * a kategória nevében és a rögzítő nevében keres (kis- és nagybetűtől függetlenül).
 */
export function searchEntries(entries: Entry[], categories: Category[], query: string, limit = 50): Entry[] {
  const q = query.trim().toLocaleLowerCase('hu');
  if (!q) return [];
  const names = new Map(categories.map((c) => [c.id, c.name.toLocaleLowerCase('hu')]));
  const tag = q.startsWith('#') ? q.slice(1) : null;
  const hit = (e: Entry) =>
    tag !== null
      ? tagsOf(e.note).includes(tag)
      : (e.note ?? '').toLocaleLowerCase('hu').includes(q) ||
        (names.get(e.categoryId) ?? '').includes(q) ||
        (e.createdBy ?? '').toLocaleLowerCase('hu').includes(q);
  return entries
    .filter(hit)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}
