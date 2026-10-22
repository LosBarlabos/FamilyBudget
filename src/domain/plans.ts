import { formatFt } from './money';
import { periodAdjective, periodDistance, periodForName, periodFromName, periodShortLabel, shiftPeriod } from './periods';
import type { Category, PeriodId, Plan } from './types';

export type PlanIndex = Map<string, Plan[]>;
export type PlanMode = 'from' | 'only';

export interface PlanOps {
  put: Plan[];
  del: { periodId: PeriodId; categoryId: string }[];
}

export function indexPlans(plans: Plan[]): PlanIndex {
  const idx: PlanIndex = new Map();
  for (const p of plans) {
    const list = idx.get(p.categoryId);
    if (list) list.push(p);
    else idx.set(p.categoryId, [p]);
  }
  for (const list of idx.values()) list.sort((a, b) => (a.periodId < b.periodId ? -1 : 1));
  return idx;
}

/**
 * Az időszak saját terve, különben a legközelebbi korábbi, különben a kategória alapértelmezése. Az első
 * időszak előtt (ha a mai nap oda esik) a költségvetés még nem indult: ott külön terv nélkül 0 a terv,
 * hogy csak a rögzített tételek számítsanak.
 */
export function effectivePlan(idx: PlanIndex, cat: Category, periodId: PeriodId, firstPeriodId?: PeriodId): number {
  const list = idx.get(cat.id);
  if (list) {
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].periodId <= periodId) return list[i].amount;
    }
  }
  return firstPeriodId !== undefined && periodId < firstPeriodId ? 0 : cat.defaultAmount;
}

/** A választható gyakoriságok (hónapban) és a felület szava. */
export const CYCLES: { months: number; label: string }[] = [
  { months: 1, label: 'havonta' },
  { months: 2, label: 'kéthavonta' },
  { months: 3, label: 'negyedévente' },
  { months: 6, label: 'félévente' },
  { months: 12, label: 'évente' },
];

/** A kategória gyakorisága hónapban: 1, ha havonta (vagy nem fix számla, vagy hiányos a beállítás). */
export function cycleOf(cat: Pick<Category, 'type' | 'cycleMonths' | 'cycleStart'>): number {
  const n = cat.cycleMonths;
  return cat.type === 'fix' && cat.cycleStart && n && CYCLES.some((c) => c.months === n && n > 1) ? n : 1;
}

export function cycleLabel(months: number): string {
  return CYCLES.find((c) => c.months === months)?.label ?? `${months} havonta`;
}

/** Esedékes-e a számla az időszakban (havonta mindig). */
export function isDuePeriod(cat: Pick<Category, 'type' | 'cycleMonths' | 'cycleStart'>, periodId: PeriodId): boolean {
  const n = cycleOf(cat);
  if (n === 1) return true;
  const d = periodDistance(cat.cycleStart!, periodId);
  return ((d % n) + n) % n === 0;
}

/** Az első esedékes időszak fromId-tól (azt is beleértve). */
export function nextDuePeriod(cat: Pick<Category, 'type' | 'cycleMonths' | 'cycleStart'>, fromId: PeriodId): PeriodId {
  let id = fromId;
  for (let i = 0; i < cycleOf(cat) && !isDuePeriod(cat, id); i++) id = shiftPeriod(id, 1);
  return id;
}

/**
 * Az időszak terve a gyakorisággal együtt: nem esedékes hónapban 0, egyébként az (alkalmankénti) érvényes terv.
 * A tervrekordok öröklése nem függ a gyakoriságtól, így a ciklus módosítása nem írja át a tárolt összegeket.
 */
export function scheduledPlan(idx: PlanIndex, cat: Category, periodId: PeriodId, firstPeriodId?: PeriodId): number {
  return isDuePeriod(cat, periodId) ? effectivePlan(idx, cat, periodId, firstPeriodId) : 0;
}

/**
 * Ettől az időszaktól hat az alapösszeg (új kategóriánál és módosításnál): a mostanitól, de ha a költségvetés
 * még nem indult el, az első időszaktól, mert az előtte lévőben csak a tény számít.
 */
export function planStartId(currentId: PeriodId, firstPeriodId: PeriodId): PeriodId {
  return currentId < firstPeriodId ? firstPeriodId : currentId;
}

/**
 * 'from': ettől az időszaktól érvényes, a későbbi felülírások törlődnek.
 * 'only': csak erre az időszakra; a következő időszak megtartja a korábban érvényes értéket.
 */
export function planChangeOps(
  plans: Plan[],
  cat: Category,
  periodId: PeriodId,
  amount: number,
  mode: PlanMode,
): PlanOps {
  const own = plans.filter((p) => p.categoryId === cat.id);
  const put: Plan[] = [{ periodId, categoryId: cat.id, amount }];
  const del: PlanOps['del'] = [];
  if (mode === 'from') {
    for (const p of own) if (p.periodId > periodId) del.push({ periodId: p.periodId, categoryId: cat.id });
  } else {
    const next = shiftPeriod(periodId, 1);
    if (!own.some((p) => p.periodId === next)) {
      const before = effectivePlan(indexPlans(own), cat, next);
      if (before !== amount) put.push({ periodId: next, categoryId: cat.id, amount: before });
    }
  }
  return { put, del };
}

export function applyPlanOps(plans: Plan[], ops: PlanOps): Plan[] {
  const key = (p: { periodId: string; categoryId: string }) => `${p.periodId}|${p.categoryId}`;
  const removed = new Set([...ops.del, ...ops.put].map(key));
  return [...plans.filter((p) => !removed.has(key(p))), ...ops.put];
}

/**
 * Az alapértelmezett összeg csak sablon: a múltbeli terveket nem írhatja át. Ezért minden kategória kap egy
 * tervrekordot az első időszakra (vagy korábbra), és onnantól az öröklés sosem esik vissza az alapösszegre.
 * Idempotens: annak a kategóriának, amelynek már van ilyen rekordja, nem ad újat.
 */
export function missingBasePlans(categories: Category[], plans: Plan[], firstPeriodId: PeriodId): Plan[] {
  const covered = new Set(plans.filter((p) => p.periodId <= firstPeriodId).map((p) => p.categoryId));
  return categories
    .filter((c) => !covered.has(c.id))
    .map((c) => ({ periodId: firstPeriodId, categoryId: c.id, amount: c.defaultAmount }));
}

/**
 * Új kategória (a varázslón kívül) a mostani időszaktól kapja az alapösszegét (ha a költségvetés még nem
 * indult el, az elsőtől); a korábbi időszakokban még nem létezett, ott 0 a terve.
 */
export function newCategoryPlans(cat: Category, firstPeriodId: PeriodId, currentId: PeriodId): Plan[] {
  const from = planStartId(currentId, firstPeriodId);
  const out: Plan[] = [{ periodId: from, categoryId: cat.id, amount: cat.defaultAmount }];
  if (firstPeriodId < from) out.unshift({ periodId: firstPeriodId, categoryId: cat.id, amount: 0 });
  return out;
}

/**
 * Első indítás: az első időszak kapja az alapösszegeket. Ha a költségvetés a következő fizetéssel indul,
 * a mostani (még az első előtti) időszak 0-s tervet kap, hogy ott csak a ténylegesen rögzített összegek
 * számítsanak a futó egyenlegbe.
 */
export function initialPlans(categories: Category[], firstPeriodId: PeriodId, currentId: PeriodId): Plan[] {
  const out = missingBasePlans(categories, [], firstPeriodId);
  if (currentId < firstPeriodId) {
    for (const c of categories) out.push({ periodId: currentId, categoryId: c.id, amount: 0 });
  }
  return out;
}

/** A kategória az adott időszak utáni egyedi tervei, amelyek ténylegesen megváltoztatják az összeget. */
export function laterPlanChanges(plans: Plan[], cat: Category, periodId: PeriodId): Plan[] {
  const own = indexPlans(plans.filter((p) => p.categoryId === cat.id)).get(cat.id) ?? [];
  let prev = effectivePlan(indexPlans(own), cat, periodId);
  const out: Plan[] = [];
  for (const p of own) {
    if (p.periodId <= periodId) continue;
    if (p.amount !== prev) out.push(p);
    prev = p.amount;
  }
  return out;
}

/** Az „ettől a hónaptól” mentés ezeket a későbbi egyedi terveket törli (az új összeggel egyezők nem számítanak). */
export function plansRemovedFrom(plans: Plan[], cat: Category, periodId: PeriodId, amount: number): Plan[] {
  return laterPlanChanges(plans, cat, periodId).filter((p) => p.amount !== amount);
}

/**
 * A Tervező toastja egy soronkénti mentés után: a hatály, és mi tűnik el vagy áll vissza miatta.
 * Pl. „Élelmiszer: 95 000 Ft novembertől · a decemberi egyedi terv (150 000 Ft) törölve”.
 */
export function planChangeSummary(plans: Plan[], cat: Category, periodId: PeriodId, amount: number, mode: PlanMode): string {
  return `${cat.name}: ${planChangeEffect(plans, cat, periodId, amount, mode)}`;
}

/** A tervmódosítás hatálya a kategória neve nélkül, pl. „95 000 Ft novembertől · a decemberi … törölve”. */
export function planChangeEffect(plans: Plan[], cat: Category, periodId: PeriodId, amount: number, mode: PlanMode): string {
  if (mode === 'only') {
    const restore = planChangeOps(plans, cat, periodId, amount, mode).put.find((p) => p.periodId !== periodId);
    const tail = restore ? ` · ${periodFromName(restore.periodId)} újra ${formatFt(restore.amount)}` : '';
    return `${formatFt(amount)} csak ${periodForName(periodId)}${tail}`;
  }
  const removed = plansRemovedFrom(plans, cat, periodId, amount);
  let tail = '';
  if (removed.length === 1) {
    tail = ` · a ${periodAdjective(removed[0].periodId, periodId)} egyedi terv (${formatFt(removed[0].amount)}) törölve`;
  } else if (removed.length > 1) {
    const list = removed.map((p) => `${periodShortLabel(p.periodId, periodId)}: ${formatFt(p.amount)}`).join(', ');
    tail = ` · ${removed.length} későbbi egyedi terv törölve (${list})`;
  }
  return `${formatFt(amount)} ${periodFromName(periodId)}${tail}`;
}
