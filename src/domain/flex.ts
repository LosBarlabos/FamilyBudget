import type { CategoryFigures, PeriodSummary } from './balance';
import { formatFt, formatSigned } from './money';
import { article, type EnvelopeStatus, type PaceOverview } from './pace';
import { periodForName, periodFromName, shiftPeriod, type PeriodStatus } from './periods';
import { effectivePlan, indexPlans, planChangeOps, type PlanOps } from './plans';
import { fixStatus } from './status';
import type { Category, PeriodId, Plan } from './types';

// Rugalmas keretek, maradék-átvitel nélkül: a ki nem költött keret a futó egyenlegbe megy, de egy időszakon
// belül a keretek terve átrendezhető („Átcsoportosítás”), és a megváltozott számladíj tervvé tehető.

// --- Átcsoportosítás --------------------------------------------------------

/**
 * Lezárt időszakban a terv már nem változtat semmin (a tény számít), ezért ott nincs átcsoportosítás. A költségvetés
 * első időszaka előtt sem: ott szándékosan minden terv 0, csak a rögzített összegek számítanak.
 */
export function coverAllowed(p: { id: PeriodId; status: PeriodStatus }, firstPeriodId: PeriodId): boolean {
  return p.status !== 'closed' && p.id >= firstPeriodId;
}

/**
 * Kér-e fedezetet a keret: gyorsan fogy, túl van lépve, vagy terv nélkül volt belőle költés. Az utóbbi csak
 * akkor, ha van egyáltalán tervezett keret: ha egyiknek sincs terve, nem lenne honnan áthozni.
 */
export function needsCover(e: Pick<EnvelopeStatus, 'cat' | 'pace' | 'plan' | 'actual'>, o: Pick<PaceOverview, 'hasPlan'>): boolean {
  if (e.cat.archived) return false;
  return e.pace !== 'ok' || (o.hasPlan && !(e.plan > 0) && e.actual > 0);
}

/**
 * Mennyi fedezet kell: túllépésnél (és terv nélküli költésnél) a túllépés, gyors fogyásnál a tempó szerint
 * várható túllépés 100 Ft-ra felfelé kerekítve. 0, ha még nincs mit vetíteni (az időszak első napjai).
 */
export function coverNeed(e: Pick<EnvelopeStatus, 'plan' | 'actual' | 'expectedOver'>): number {
  const over = e.actual - Math.max(0, e.plan);
  if (over > 0) return over;
  return e.expectedOver > 0 ? Math.ceil(e.expectedOver / 100) * 100 : 0;
}

export interface CoverSource {
  cat: Category;
  plan: number;
  actual: number;
  /** A keret maradéka (terv − tény), mindig pozitív. */
  left: number;
}

/** Azok a keretek, amelyekben maradt pénz (a cél és az archiváltak kivételével), a maradék szerint csökkenő sorrendben. */
export function coverSources(o: Pick<PaceOverview, 'envelopes'>, targetId: string): CoverSource[] {
  return o.envelopes
    .filter((e) => e.cat.id !== targetId && !e.cat.archived && e.plan - e.actual > 0)
    .map((e) => ({ cat: e.cat, plan: e.plan, actual: e.actual, left: e.plan - e.actual }))
    .sort((a, b) => b.left - a.left || a.cat.order - b.cat.order);
}

/** Az előtöltött összeg: a szükséges fedezet, vagy ha a forrás maradéka kisebb, az. 0: nincs mit előtölteni. */
export function coverPrefill(need: number, sourceLeft: number): number {
  return Math.max(0, Math.min(need, sourceLeft));
}

/** Hibaüzenet, ha az összeg nem hozható át a forrásból; különben null. */
export function coverError(amount: number, source: Pick<CoverSource, 'cat' | 'left'>): string | null {
  if (!Number.isInteger(amount) || amount <= 0) return 'Adj meg egy összeget';
  if (amount > source.left) return `${article(source.cat.name)} ${source.cat.name} keretben csak ${formatFt(source.left)} maradt`;
  return null;
}

/**
 * A két „csak erre a hónapra” tervmódosítás: a forrás terve csökken, a célé ugyanennyivel nő. A következő
 * időszak mindkettőnél a korábban érvényes tervet kapja, így semmi nem öröklődik tovább. A forrás tervét és
 * tényét a hívó adatbázis-állapotából számolja, hogy a forrás ne kerülhessen túllépésbe. Hibánál dob.
 */
export function coverOps(
  plans: Plan[],
  from: Category,
  to: Category,
  periodId: PeriodId,
  amount: number,
  sourceActual: number,
  firstPeriodId?: PeriodId,
): { ops: PlanOps; fromPlan: number; toPlan: number; change: CoverChange } {
  if (from.id === to.id) throw new Error('Egy keretből önmagába nem lehet átcsoportosítani.');
  const idx = indexPlans(plans);
  const fromBefore = effectivePlan(idx, from, periodId, firstPeriodId);
  const toBefore = effectivePlan(idx, to, periodId, firstPeriodId);
  const err = coverError(amount, { cat: from, left: fromBefore - sourceActual });
  if (err) throw new Error(err);
  const fromPlan = fromBefore - amount;
  const toPlan = toBefore + amount;
  const a = planChangeOps(plans.filter((p) => p.categoryId === from.id), from, periodId, fromPlan, 'only');
  const b = planChangeOps(plans.filter((p) => p.categoryId === to.id), to, periodId, toPlan, 'only');
  const ops = { put: [...a.put, ...b.put], del: [...a.del, ...b.del] };
  const touched = new Set([...ops.put, ...ops.del].map(planKey));
  const change: CoverChange = {
    periodId, fromId: from.id, toId: to.id, amount,
    before: plans.filter((p) => touched.has(planKey(p))),
    after: ops.put,
  };
  return { ops, fromPlan, toPlan, change };
}

const planKey = (p: { periodId: PeriodId; categoryId: string }) => `${p.periodId}|${p.categoryId}`;

/** Egy áthozás a visszavonáshoz: mit írt a művelet, és mi volt ugyanott előtte. */
export interface CoverChange {
  periodId: PeriodId;
  fromId: string;
  toId: string;
  amount: number;
  /** Az érintett tervrekordok korábbi állapota; amelyik kulcs hiányzik, az a rekord nem létezett. */
  before: Plan[];
  /** Amit a művelet ugyanezekre a kulcsokra írt. */
  after: Plan[];
}

/**
 * Egy áthozás visszavonása, a többi tervmódosítás érintetlenül hagyásával. Keretenként: ha a művelet rekordjai
 * azóta nem változtak, a korábbi állapotuk áll vissza pontosan. Ha közben más is módosította őket (pl. egy
 * második áthozás ugyanabba a keretbe), a pillanatkép visszaírása azt is eltüntetné, és a tervek összege
 * elcsúszna; ott csak ez az összeg kerül vissza (a forrás terve nő, a célé csökken), csak erre az időszakra.
 * Hibánál dob.
 */
export function uncoverOps(plans: Plan[], from: Category, to: Category, change: CoverChange, firstPeriodId?: PeriodId): PlanOps {
  const current = new Map(plans.map((p) => [planKey(p), p]));
  const before = new Map(change.before.map((p) => [planKey(p), p]));
  const after = new Map(change.after.map((p) => [planKey(p), p]));
  const keys = [...new Map([...change.before, ...change.after].map((p) => [planKey(p), p])).values()];
  const put: Plan[] = [];
  const del: PlanOps['del'] = [];
  for (const [cat, delta] of [[from, change.amount], [to, -change.amount]] as const) {
    const own = keys.filter((p) => p.categoryId === cat.id).map(planKey);
    const untouched = own.every((k) => current.get(k)?.amount === after.get(k)?.amount);
    if (untouched) {
      for (const k of own) {
        const b = before.get(k);
        if (b) put.push(b);
        else del.push(after.get(k)!);
      }
      continue;
    }
    const mine = plans.filter((p) => p.categoryId === cat.id);
    const amount = effectivePlan(indexPlans(mine), cat, change.periodId, firstPeriodId) + delta;
    if (amount < 0) throw new Error(`${article(cat.name).toLowerCase()} ${cat.name} terve azóta kevesebb lett az átcsoportosított összegnél`);
    const ops = planChangeOps(mine, cat, change.periodId, amount, 'only');
    put.push(...ops.put);
    del.push(...ops.del);
  }
  return { put, del: del.map(({ periodId, categoryId }) => ({ periodId, categoryId })) };
}

/**
 * Mennyit változik a futó egyenleg (az időszak végén) az átcsoportosítástól. A keret max(tény, terv)-vel
 * számít: gyors fogyásnál a két terv összege marad, így 0. A túllépett keret viszont eddig is a tényével
 * számított, ezért ami a túllépést fedezi, az a forrásból kevesebbet számol, és az előrejelzés ennyivel javul.
 */
export function coverBalanceEffect(
  target: Pick<CategoryFigures, 'plan' | 'actual'>,
  source: Pick<CategoryFigures, 'plan' | 'actual'>,
  amount: number,
): number {
  const counted = (plan: number, actual: number) => Math.max(actual, plan);
  const before = counted(target.plan, target.actual) + counted(source.plan, source.actual);
  const after = counted(target.plan + amount, target.actual) + counted(source.plan - amount, source.actual);
  return before - after;
}

/** A felület mondata az átcsoportosítás hatásáról. */
export function coverEffectText(effect: number, sourceName: string): string {
  if (effect === 0) return 'A futó egyenleg nem változik, csak átrendeződik.';
  return (
    `A tervek összege nem változik, csak átrendeződik. A futó egyenleg mégis ${formatSigned(effect)}-tal javul: ` +
    `a túllépés eddig is benne volt, ${article(sourceName).toLowerCase()} ${sourceName} keretből viszont ennyivel kevesebbet számol.`
  );
}

/** „Csak októberre szól, novembertől mindkét keret a korábbi tervével folytatódik.” */
export function coverScopeText(periodId: PeriodId): string {
  const next = periodFromName(shiftPeriod(periodId, 1));
  return `Csak ${periodForName(periodId)} szól, ${next} mindkét keret a korábbi tervével folytatódik.`;
}

/** A keret állása a fedezet-lapon: „túllépés 5 000 Ft”, „~3 000 Ft túllépés várható”, „terv nélkül 8 000 Ft”. */
export function coverTargetText(e: Pick<EnvelopeStatus, 'plan' | 'actual' | 'expectedOver'>): string {
  if (!(e.plan > 0)) return `terv nélkül ${formatFt(e.actual)}`;
  if (e.actual > e.plan) return `túllépés ${formatFt(e.actual - e.plan)}`;
  if (e.expectedOver > 0) return `~${formatFt(Math.round(e.expectedOver / 100) * 100)} túllépés várható`;
  return `maradt ${formatFt(e.plan - e.actual)}`;
}

/** „5 000 Ft átcsoportosítva: Szabadidő → Élelmiszer · csak októberre” */
export function coverMessage(from: Pick<Category, 'name'>, to: Pick<Category, 'name'>, amount: number, periodId: PeriodId): string {
  return `${formatFt(amount)} átcsoportosítva: ${from.name} → ${to.name} · csak ${periodForName(periodId)}`;
}

// --- Díjváltozás-javaslat ---------------------------------------------------

/** Az elutasított javaslatok kulcsa: időszakonként és kategóriánként. */
export const feeDismissKey = (periodId: PeriodId, categoryId: string) => `${periodId}|${categoryId}`;

/** Az elutasítás megjegyzése; a lista legfeljebb max elemű, a legrégebbiek esnek ki. */
export function withDismissal(list: readonly string[], key: string, max = 100): string[] {
  return [...list.filter((k) => k !== key), key].slice(-max);
}

/**
 * Díjváltozás-javaslatok: azok a fix számlák, amelyek a tervtől eltérő összeggel lezárultak (vagy a tervnél
 * többel kifizették őket), kategóriánként az új díjjal. Csak a folyamatban lévő és a jövőbeli időszakban,
 * a költségvetés első időszakától (előtte 0 a terv, ott minden számla eltérne). Nem javasol, ha a „Nem volt”
 * (0 Ft) zárta le, ha a tervnek nincs összege, ha a következő időszak terve már az új díj, vagy ha a felhasználó
 * erre az időszakra elutasította.
 */
export function feeSuggestions(
  categories: Category[],
  p: Pick<PeriodSummary, 'id' | 'status' | 'byCategory'>,
  plans: Plan[],
  firstPeriodId: PeriodId,
  dismissed: readonly string[],
): Map<string, number> {
  const out = new Map<string, number>();
  if (p.status === 'closed' || p.id < firstPeriodId) return out;
  const idx = indexPlans(plans);
  const no = new Set(dismissed);
  const next = shiftPeriod(p.id, 1);
  for (const c of categories) {
    const f = p.byCategory.get(c.id);
    if (c.type !== 'fix' || c.archived || !f || !(f.plan > 0) || !(f.actual > 0)) continue;
    if (fixStatus(f.plan, f.actual, f.settled) !== 'paidDiff') continue;
    if (no.has(feeDismissKey(p.id, c.id))) continue;
    if (effectivePlan(idx, c, next, firstPeriodId) === f.actual) continue;
    out.set(c.id, f.actual);
  }
  return out;
}

/** „Új díj: 8 350 Ft. Legyen ez a terv ettől a hónaptól?” */
export function feeSuggestionText(amount: number): string {
  return `Új díj: ${formatFt(amount)}. Legyen ez a terv ettől a hónaptól?`;
}
