import { differenceInCalendarDays } from 'date-fns';
import type { PeriodSummary, Summaries } from './balance';
import { formatFt, formatSigned } from './money';
import { fromISO, MONTHS_SHORT, shortDate } from './periods';
import type { Category, ISODate } from './types';

export interface PeriodDays {
  total: number;
  /** Eltelt napok a mai nappal együtt (0, ha az időszak még nem kezdődött el). */
  elapsed: number;
  /** Hátralévő napok a mai nappal együtt (0, ha az időszak már véget ért). */
  remaining: number;
  /** Az eltelt idő aránya (0–1): a „ma” jelölő helye és a tempó mércéje. */
  ratio: number;
}

export function periodDays(start: ISODate, end: ISODate, today: ISODate): PeriodDays {
  const total = Math.max(1, differenceInCalendarDays(fromISO(end), fromISO(start)) + 1);
  const clamp = (n: number) => Math.min(total, Math.max(0, n));
  const elapsed = clamp(differenceInCalendarDays(fromISO(today), fromISO(start)) + 1);
  const remaining = clamp(differenceInCalendarDays(fromISO(end), fromISO(today)) + 1);
  return { total, elapsed, remaining, ratio: elapsed / total };
}

export type Pace = 'ok' | 'fast' | 'over';

/** A tempó-figyelmeztetés tűrése: a lineárisan várhatónál 10%-kal több még rendben van. */
const FAST_TOLERANCE = 1.1;
/** Az időszak elején egy nagybevásárlás még ne riasszon: a terv 20%-a alatt nincs tempó-figyelmeztetés. */
const FAST_FLOOR = 0.2;
/**
 * Ennyi eltelt nap előtt nincs lineáris vetítés: az első napokban egy nagybevásárlás a keret többszörösére
 * nagyítódna, ami nem hihető előrejelzés.
 */
export const MIN_PROJECTION_DAYS = 7;

/**
 * A keret állása az eltelt időhöz mérve. Terv nélkül (0 Ft) nincs mihez mérni: a kiadás „nem tervezett”,
 * nem túllépés.
 */
export function envelopePace(plan: number, actual: number, elapsedRatio: number): Pace {
  if (!(plan > 0)) return 'ok';
  if (actual > plan) return 'over';
  if (actual > plan * elapsedRatio * FAST_TOLERANCE && actual > plan * FAST_FLOOR) return 'fast';
  return 'ok';
}

/** Lineáris tempó: ennyi lesz a kiadás az időszak végére, ha így folytatódik. */
export function projectedSpend(actual: number, elapsedRatio: number): number {
  if (!(elapsedRatio > 0)) return actual;
  return Math.round(actual / Math.min(1, elapsedRatio));
}

/**
 * Beleszámít-e a keret a napi elkölthető összegbe. Alapból minden keret igen, kivéve a váratlan kiadásokét,
 * mert az nem naponta fogy. A napi összegen kívüli keretnél nincs tempó, csak a túllépés látszik.
 */
export function countsInDaily(c: Pick<Category, 'type' | 'role' | 'excludeFromDaily'>): boolean {
  return c.type === 'keret' && !(c.excludeFromDaily ?? c.role === 'unexpected');
}

/** Napi összeg 100 Ft-ra kerekítve, a nulla felé, hogy ne ígérjen többet a ténylegesnél; null, ha nincs hátra nap. */
export function perDayAmount(left: number, days: number): number | null {
  if (!(days > 0)) return null;
  return Math.trunc(left / days / 100) * 100 || 0;
}

export interface Allowance {
  /** A keretek maradékainak összege; a túllépés csökkenti, így negatív is lehet. */
  left: number;
  /** A keretek tervének összege. */
  plan: number;
  /** Naponta ennyi költhető a hátralévő napokban; null, ha az időszakból nincs hátra nap. */
  perDay: number | null;
}

/** A napi pénzbe beleszámító keretek maradéka (a túllépés csökkenti), osztva a hátralévő napokkal. */
export function dailyAllowance(envelopes: { plan: number; actual: number }[], remainingDays: number): Allowance {
  let left = 0;
  let plan = 0;
  for (const e of envelopes) {
    left += e.plan - e.actual;
    plan += e.plan;
  }
  return { left, plan, perDay: perDayAmount(left, remainingDays) };
}

export interface EnvelopeView {
  pace: Pace;
  /** A „ma” jelölő helye (0–1); csak a folyamatban lévő időszakban, napi keretnél, különben null. */
  marker: number | null;
  /** Terv − tény; túllépésnél negatív. */
  left: number;
  /** A maradék naponta; csak ahol van tempó és maradék, különben null. */
  perDay: number | null;
  /** A várható kiadás az időszak végére (tempó nélkül, és az időszak első napjaiban is a tény). */
  projected: number;
}

/**
 * Egy sáv (egy keret, vagy egy csoport összesítve) állása. Tempó csak a folyamatban lévő időszakban és csak
 * akkor van, ha minden kategóriája napi keret; különben (fix számla, lezárt vagy jövőbeli időszak) csak
 * a túllépés számít.
 */
export function envelopeView(
  cats: Pick<Category, 'type' | 'role' | 'excludeFromDaily'>[],
  fig: { plan: number; actual: number },
  days: PeriodDays,
  current: boolean,
): EnvelopeView {
  const tempo = current && cats.length > 0 && cats.every(countsInDaily);
  const ratio = tempo ? days.ratio : 1;
  const project = tempo && days.elapsed >= MIN_PROJECTION_DAYS;
  const left = fig.plan - fig.actual;
  return {
    pace: envelopePace(fig.plan, fig.actual, ratio),
    marker: tempo ? days.ratio : null,
    left,
    perDay: tempo && fig.plan > 0 && left > 0 ? perDayAmount(left, days.remaining) : null,
    projected: project ? projectedSpend(fig.actual, ratio) : fig.actual,
  };
}

export interface EnvelopeStatus extends EnvelopeView {
  cat: Category;
  plan: number;
  actual: number;
  /** A várható túllépés (tempó szerint, ha van); a figyelmeztetések sorrendje ez alapján. */
  expectedOver: number;
}

export interface PaceOverview {
  days: PeriodDays;
  current: boolean;
  /** Minden keret, amely az időszakban szerepel. */
  envelopes: EnvelopeStatus[];
  byId: Map<string, EnvelopeStatus>;
  /** Csak a napi összegbe beleszámító keretekből. */
  allowance: Allowance;
  /** Van-e a napi összegbe számító keret, amelynek van terve. */
  hasDailyPlan: boolean;
  /** Van-e egyáltalán tervezett keret (a napi összegen kívüliekkel együtt). */
  hasPlan: boolean;
  /** A tempó szerint gyorsan fogyó vagy túllépett keretek, a várható túllépés szerint csökkenő sorrendben. */
  flagged: EnvelopeStatus[];
  /**
   * Terv nélküli, napi összegbe számító keretek, amelyekből mégis költöttetek (a kiadás szerint csökkenő
   * sorrendben). A tempójuk 'ok', de a napi összeget csökkentik, ezért külön figyelmet kérnek. Üres, ha nincs
   * napi keretterv: akkor minden költés terv nélküli lenne.
   */
  unplanned: EnvelopeStatus[];
}

export function paceOverview(categories: Category[], p: PeriodSummary, today: ISODate): PaceOverview {
  const days = periodDays(p.start, p.end, today);
  const current = p.status === 'current';
  const envelopes: EnvelopeStatus[] = [];
  for (const cat of categories) {
    const fig = cat.type === 'keret' ? p.byCategory.get(cat.id) : undefined;
    if (!fig) continue;
    const view = envelopeView([cat], fig, days, current);
    envelopes.push({ ...view, cat, plan: fig.plan, actual: fig.actual, expectedOver: Math.max(view.projected, fig.actual) - fig.plan });
  }
  // Az archivált keret a folyamatban lévő időszakban terv nélkül marad: az eddigi költése ne vonódjon le
  // túlköltésként a még elkölthető összegből, hiszen a sora sem látszik már.
  const daily = envelopes.filter((e) => countsInDaily(e.cat) && !e.cat.archived);
  const hasDailyPlan = daily.some((e) => e.plan > 0);
  return {
    days,
    current,
    envelopes,
    byId: new Map(envelopes.map((e) => [e.cat.id, e])),
    allowance: dailyAllowance(daily, current ? days.remaining : 0),
    hasDailyPlan,
    hasPlan: envelopes.some((e) => e.plan > 0),
    flagged: envelopes.filter((e) => e.pace !== 'ok').sort((a, b) => b.expectedOver - a.expectedOver),
    unplanned: hasDailyPlan ? daily.filter((e) => !(e.plan > 0) && e.actual > 0).sort((a, b) => b.actual - a.actual) : [],
  };
}

export interface PaceStatus {
  tone: Pace;
  text: string;
  /** A mondatban nem szereplő, figyelmet kérő keretek száma. */
  more: number;
}

/**
 * A hero állapotmondata: a leginkább túlfutó keret, ennek híján a terv nélküli költés, és csak ha egyik sincs,
 * „A terv szerint haladtok” – különben a túllépett napi összeg mellett zöld pipa állna.
 */
export function paceStatus(o: Pick<PaceOverview, 'flagged' | 'unplanned'>): PaceStatus {
  const more = Math.max(0, o.flagged.length + o.unplanned.length - 1);
  const worst = o.flagged[0];
  if (worst) return { tone: worst.pace, text: paceSentence(worst), more };
  const u = o.unplanned[0];
  if (u) return { tone: 'fast', text: unplannedSentence(u), more };
  return { tone: 'ok', text: paceSentence(null), more: 0 };
}

/**
 * Tartalék-mutató: az utolsó lezárt időszak végi egyenlege hány hónapnyi kiadást fedez (az utolsó legfeljebb
 * 3 lezárt időszak átlagos kiadásával számolva). Null, ha még nincs lezárt időszak vagy kiadás.
 */
export function reserveMonths(s: Pick<Summaries, 'periods'>): number | null {
  const closed = s.periods.filter((p) => p.status === 'closed');
  const last = closed.at(-1);
  if (!last) return null;
  const recent = closed.slice(-3);
  const avg = recent.reduce((sum, p) => sum + p.expense, 0) / recent.length;
  if (!(avg > 0)) return null;
  return last.endBalance / avg;
}

/** „≈ 1,4 hónapnyi kiadás”; null, ha nincs mihez mérni. */
export function reserveText(months: number | null): string | null {
  if (months === null) return null;
  if (months < 0.05) return 'nincs tartalék';
  const v = months < 10 ? months.toFixed(1).replace('.', ',').replace(',0', '') : String(Math.round(months));
  return `≈ ${v} hónapnyi kiadás`;
}

/** Névelő a név elé: „az Élelmiszer”, „a Szabadidő” (az 5-tel kezdődő szám is magánhangzóval hangzik). */
export function article(name: string): 'Az' | 'A' {
  return /^[aáeéiíoóöőuúüű5]/i.test(name.trim()) ? 'Az' : 'A';
}

/** 'okt. 9-ig' */
export function untilDate(d: ISODate): string {
  const x = fromISO(d);
  return `${MONTHS_SHORT[x.getMonth()].toLowerCase()}. ${x.getDate()}-ig`;
}

/** „12 nap van fizetésig (okt. 9-ig)”; az utolsó napon „Ma van az időszak utolsó napja”. */
export function daysLeftText(days: PeriodDays, end: ISODate): string {
  if (days.remaining <= 1) return 'Ma van az időszak utolsó napja';
  return `${days.remaining} nap van fizetésig (${untilDate(end)})`;
}

const roundTo100 = (n: number) => Math.round(n / 100) * 100;

/**
 * A hero állapotmondata a leginkább túlfutó keretről, vagy „A terv szerint haladtok”. A „keret” szó a név után
 * a többes számú neveknél (pl. Gyerekek) is helyes mondatot ad.
 */
export function paceSentence(e: EnvelopeStatus | null | undefined): string {
  if (!e) return 'A terv szerint haladtok';
  const who = `${article(e.cat.name)} ${e.cat.name} keret`;
  if (e.pace === 'over') return `${who} már ${formatFt(e.actual - e.plan)}-tal túllépte a tervet`;
  // Az időszak első napjaiban nincs vetítés (projected = tény), ilyenkor az eddig elfogyott arány áll a mondatban.
  if (e.projected <= e.plan) return `${who} gyorsabban fogy a tervezettnél: eddig ${formatFt(e.actual)}, a terv ${usedPct(e)}%-a`;
  return `${who} gyorsabban fogy a tervezettnél, ezzel a tempóval ~${formatFt(roundTo100(e.projected - e.plan))}-tal lépi túl`;
}

/** A keret tervének eddig elfogyott része százalékban. */
export function usedPct(e: Pick<EnvelopeStatus, 'plan' | 'actual'>): number {
  return e.plan > 0 ? Math.round((e.actual / e.plan) * 100) : 0;
}

/** „Az Ajándék keretből terv nélkül 80 000 Ft-ot költöttetek” */
export function unplannedSentence(e: Pick<EnvelopeStatus, 'cat' | 'actual'>): string {
  return `${article(e.cat.name)} ${e.cat.name} keretből terv nélkül ${formatFt(e.actual)}-ot költöttetek`;
}

/** Miért nincs napi összeg: nincs keretterv, nincs napi összegbe számító keret, vagy annak nincs terve. */
export function noDailyPlanText(o: Pick<PaceOverview, 'hasPlan' | 'envelopes'>): string {
  if (!o.hasPlan) return 'ebben az időszakban nincs tervezett keret';
  return o.envelopes.some((e) => countsInDaily(e.cat) && !e.cat.archived)
    ? 'a napi összegbe számító kereteknek nincs terve'
    : 'egyik keret sem számít a napi elkölthető összegbe';
}

/** A keret sorának szövege: „maradt 27 000 Ft · ~2 200 Ft/nap”, túllépésnél „túllépés 4 000 Ft”. */
export function envelopeLeftText(v: Pick<EnvelopeView, 'left' | 'perDay'>): string {
  if (v.left < 0) return `túllépés ${formatFt(-v.left)}`;
  return v.perDay !== null ? `maradt ${formatFt(v.left)} · ~${formatFt(v.perDay)}/nap` : `maradt ${formatFt(v.left)}`;
}

/** Ha a keretek összesen túl vannak lépve, ez áll a „Még elkölthető” helyett. */
export function overspentText(left: number): string {
  return `A keretek összesen ${formatFt(-left)}-tal túl vannak lépve`;
}

/** Lezárt időszak hero-mondata: „Az időszak +45 000 Ft-tal zárult”. */
export function closingSentence(net: number): string {
  if (net > 0) return `Az időszak ${formatSigned(net)}-tal zárult`;
  if (net < 0) return `Az időszak ${formatFt(-net)} mínusszal zárult`;
  return 'Az időszak nullszaldóval zárult';
}

/** Jövőbeli időszak: „33 nap múlva kezdődik (nov. 10.)”. */
export function startsInText(start: ISODate, today: ISODate): string {
  const n = differenceInCalendarDays(fromISO(start), fromISO(today));
  if (n <= 0) return `Kezdete: ${shortDate(start)}`;
  return n === 1 ? `Holnap kezdődik (${shortDate(start)})` : `${n} nap múlva kezdődik (${shortDate(start)})`;
}
