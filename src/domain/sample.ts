import { addDays } from 'date-fns';
import { normalizeExport, type ExportFile } from './exportFormat';
import { makeConfig, periodForDate, periodEnd, periodRange, periodStart, shiftPeriod, fromISO, toISO } from './periods';
import { isDuePeriod } from './plans';
import { dueDateInPeriod } from './status';
import type { Category, CategoryType, Entry, ISODate, PeriodId, Plan } from './types';

/**
 * Mintaadat a design-felméréshez (DESIGN_TERV.md, 0. fázis): ugyanaz a mai napra mindig ugyanazt adja, így a
 * képernyőképek megismételhetők. A fizetésnapot a mai naphoz igazítja, hogy a folyamatban lévő időszak mindig
 * a közepén járjon (18. nap), és legyen benne lejárt és hamarosan esedékes számla, gyorsan fogyó és túllépett
 * keret, el nem érkezett bevétel és lemaradó cél.
 * - 'teljes': egy átlagos család 14 lezárt időszakkal.
 * - 'szelso': negatív futó egyenleg, 40 kategória, hosszú nevek, nyolcjegyű összegek, sok teendő, régi mentés,
 *   el nem indított havi zárás.
 */
export type SampleKind = 'teljes' | 'szelso';

export const SAMPLE_KINDS: readonly SampleKind[] = ['teljes', 'szelso'];

/** A folyamatban lévő időszakból ennyi nap telt el a mai nappal együtt. */
const ELAPSED_DAYS = 18;
const CLOSED_PERIODS = 14;

/** Determinisztikus álvéletlen (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const dayOf = (d: ISODate) => Number(d.slice(8, 10));
const plusDays = (d: ISODate, n: number) => toISO(addDays(fromISO(d), n));

interface CatSpec {
  id: string;
  name: string;
  icon: string;
  type: CategoryType;
  color: string;
  amount: number;
  group?: string;
  extra?: Partial<Category>;
  /** Keret: a lezárt időszakok rögzítéseinek száma és megjegyzései. */
  count?: [min: number, max: number];
  notes?: string[];
}

export function buildSample(kind: SampleKind, now = new Date()): ExportFile {
  const rand = rng(kind === 'teljes' ? 20261022 : 77);
  const between = (min: number, max: number) => min + rand() * (max - min);
  const pick = <T>(list: T[]) => list[Math.floor(rand() * list.length)];
  const today = toISO(now);

  // A fizetésnap úgy, hogy ma az időszak 18. napja legyen (a 28. utáni fizetésnap a rövid hónapokban csúszna).
  let start = plusDays(today, -(ELAPSED_DAYS - 1));
  while (dayOf(start) > 28) start = plusDays(start, -1);
  const payday = dayOf(start);
  const cfg = makeConfig(payday, []);
  const currentId = periodForDate(today, cfg);
  const firstPeriodId = shiftPeriod(currentId, -CLOSED_PERIODS);
  const curStart = periodStart(currentId, cfg);
  const curEnd = periodEnd(currentId, cfg);
  const at = (offset: number) => plusDays(today, offset);
  const szelso = kind === 'szelso';

  const BLUE = '#2a78d6', ORANGE = '#eb6834', AQUA = '#1baf7a', YELLOW = '#eda100', MAGENTA = '#e87ba4';
  const GREEN = '#008300', VIOLET = '#6250d6', TEAL = '#0f8a8a', BROWN = '#8a5a2b', GRAY = '#888780';
  const PLUM = '#a05195', SLATE = '#4f6d8a';

  const specs: CatSpec[] = [
    { id: 'fizetes', name: 'Fizetés', icon: 'cash', type: 'bevetel', color: AQUA, amount: szelso ? 540_000 : 865_000, group: 'Bevétel', extra: { incomeMode: 'fix' } },
    { id: 'potlek', name: 'Családi pótlék', icon: 'gift', type: 'bevetel', color: AQUA, amount: 26_600, group: 'Bevétel', extra: { incomeMode: 'fix' } },
    { id: 'egyeb-bev', name: 'Egyéb bevétel', icon: 'coin', type: 'bevetel', color: AQUA, amount: 0, group: 'Bevétel', extra: { incomeMode: 'keret' } },
    { id: 'hitel', name: 'Lakáshitel', icon: 'home', type: 'fix', color: BLUE, amount: 186_400, group: 'Lakhatás', extra: { dueDay: dayOf(plusDays(curStart, 4)) } },
    { id: 'kozos', name: 'Közös költség', icon: 'building', type: 'fix', color: BLUE, amount: 32_000, group: 'Lakhatás', extra: { dueDay: dayOf(plusDays(curStart, 2)), autoPayFrom: firstPeriodId } },
    { id: 'lakasbizt', name: 'Lakásbiztosítás', icon: 'shield', type: 'fix', color: BLUE, amount: 64_800, group: 'Lakhatás', extra: { dueDay: dayOf(plusDays(curStart, 9)), cycleMonths: 12, cycleStart: shiftPeriod(currentId, 2) } },
    { id: 'aram', name: 'Áram', icon: 'bolt', type: 'fix', color: YELLOW, amount: 14_500, group: 'Rezsi', extra: { dueDay: dayOf(at(-3)) } },
    { id: 'gaz', name: 'Gáz', icon: 'flame', type: 'fix', color: YELLOW, amount: 19_000, group: 'Rezsi', extra: { dueDay: dayOf(at(2)) } },
    { id: 'viz', name: 'Víz és csatorna', icon: 'droplet', type: 'fix', color: YELLOW, amount: 13_800, group: 'Rezsi', extra: { dueDay: dayOf(at(9)), cycleMonths: 2, cycleStart: currentId } },
    { id: 'telefon', name: 'Telefon', icon: 'device-mobile', type: 'fix', color: YELLOW, amount: 12_990, group: 'Rezsi', extra: { dueDay: dayOf(at(-1)), autoPayFrom: firstPeriodId } },
    { id: 'internet', name: 'Internet és TV', icon: 'wifi', type: 'fix', color: YELLOW, amount: 9_990, group: 'Rezsi', extra: { dueDay: dayOf(plusDays(curStart, 8)) } },
    { id: 'autobizt', name: 'Kötelező biztosítás', icon: 'car', type: 'fix', color: VIOLET, amount: 21_600, group: 'Autó', extra: { dueDay: dayOf(plusDays(curStart, 12)), cycleMonths: 3, cycleStart: shiftPeriod(currentId, 1) } },
    { id: 'elelmiszer', name: 'Élelmiszer', icon: 'shopping-cart', type: 'keret', color: ORANGE, amount: 160_000, count: [11, 17], notes: ['Lidl', 'Aldi', 'Spar', 'Piac', 'Tesco nagybevásárlás', 'Pékség', '#hétvége', 'Hentes'] },
    { id: 'haztartas', name: 'Háztartás', icon: 'basket', type: 'keret', color: AQUA, amount: 30_000, count: [2, 5], notes: ['dm', 'Rossmann', 'Mosószer', 'IKEA #lakás'] },
    { id: 'kozlekedes', name: 'Közlekedés', icon: 'gas-station', type: 'keret', color: VIOLET, amount: 48_000, count: [3, 6], notes: ['Tankolás', 'BKK bérlet', 'Parkolás', 'Autópálya-matrica'] },
    { id: 'gyerekek', name: 'Gyerekek', icon: 'mood-kid', type: 'keret', color: MAGENTA, amount: 40_000, count: [3, 7], notes: ['Úszás', 'Iskolai kirándulás #iskola', 'Születésnap #szülinap', 'Tankönyv #iskola', 'Játék'] },
    { id: 'egeszseg', name: 'Egészség', icon: 'heart', type: 'keret', color: SLATE, amount: 15_000, count: [1, 3], notes: ['Gyógyszertár', 'Fogorvos', 'Vitamin'] },
    { id: 'ruhazat', name: 'Ruházat', icon: 'shirt', type: 'keret', color: GREEN, amount: 25_000, count: [1, 3], notes: ['Cipő', 'Téli kabát', 'Decathlon'] },
    { id: 'szabadido', name: 'Szabadidő', icon: 'movie', type: 'keret', color: TEAL, amount: 35_000, count: [2, 5], notes: ['Mozi', 'Étterem #szülinap', 'Strand #nyaralás', 'Koncert', 'Állatkert'] },
    { id: 'ajandek', name: 'Ajándék', icon: 'gift', type: 'keret', color: PLUM, amount: 0, count: [0, 1], notes: ['Születésnap #szülinap', 'Névnap'] },
    { id: 'egyeb', name: 'Egyéb', icon: 'dots', type: 'keret', color: GRAY, amount: 15_000, count: [1, 3], notes: ['Posta', 'Kulcsmásolás', 'Fodrász'], extra: { excludeFromDaily: true } },
    { id: 'varatlan', name: 'Váratlan kiadások', icon: 'alert-triangle', type: 'keret', color: PLUM, amount: 20_000, count: [0, 1], notes: ['Mosógép javítás', 'Autószerviz'], extra: { role: 'unexpected' } },
    { id: 'vesztartalek', name: 'Vésztartalék', icon: 'pig-money', type: 'megtakaritas', color: BROWN, amount: 50_000, extra: { goalAmount: 1_500_000, goalDeadline: shiftPeriod(currentId, 18), goalStart: 400_000 } },
    { id: 'nyaralas', name: 'Nyaralás 2027', icon: 'beach', type: 'megtakaritas', color: BROWN, amount: 30_000, extra: { goalAmount: 900_000, goalDeadline: shiftPeriod(currentId, 8), goalStart: 100_000 } },
    { id: 'megtakaritas', name: 'Megtakarítás', icon: 'pig-money', type: 'megtakaritas', color: BROWN, amount: 40_000 },
    { id: 'edzoterem', name: 'Edzőterem', icon: 'ball-football', type: 'fix', color: TEAL, amount: 14_900, extra: { archived: true } },
  ];

  if (szelso) {
    const longs: [string, string, number][] = [
      ['Gyerekek iskolai, különórai és sportegyesületi költségei', 'school', 45_000],
      ['Önkéntes nyugdíj- és egészségpénztári befizetés', 'shield', 25_000],
      ['Háziállat (eledel, állatorvos, kozmetika)', 'paw', 18_000],
      ['Streaming-előfizetések', 'movie', 11_970],
      ['Taxi', 'car', 9_000],
      ['Kávézó', 'tools-kitchen-2', 12_000],
      ['Sport', 'ball-football', 14_000],
      ['Szépségápolás', 'heart', 10_000],
      ['Bölcsőde', 'mood-kid', 38_000],
      ['Tanfolyamok', 'school', 22_000],
    ];
    longs.forEach(([name, icon, amount], i) =>
      specs.push({ id: `extra-${i}`, name, icon, type: 'keret', color: [TEAL, SLATE, GREEN, VIOLET, MAGENTA][i % 5], amount, count: [1, 4], notes: ['Kártyás fizetés'] }),
    );
    const bills: [string, number][] = [['Szemétszállítás', 7_400], ['Kábeltévé', 6_990], ['Biztonsági szolgálat', 4_500], ['Életbiztosítás', 16_000]];
    bills.forEach(([name, amount], i) =>
      specs.push({ id: `szamla-${i}`, name, icon: 'receipt', type: 'fix', color: BLUE, amount, group: 'Rezsi', extra: { dueDay: dayOf(at(-2 - i)) } }),
    );
    specs.push({ id: 'lakasvasarlas', name: 'Lakásvásárlás önrésze', icon: 'key', type: 'megtakaritas', color: BROWN, amount: 150_000, extra: { goalAmount: 45_000_000, goalDeadline: shiftPeriod(currentId, 60), goalStart: 12_400_000 } });
  }

  const categories: Category[] = specs.map((s, order) => ({
    id: `minta-${s.id}`, name: s.name, icon: s.icon, color: s.color, type: s.type, group: s.group,
    defaultAmount: s.amount, order, archived: false, ...s.extra,
  }));
  const catOf = (id: string) => categories.find((c) => c.id === `minta-${id}`)!;

  // Tervek: az első időszaktól az alapösszeg, két későbbi módosítással (lásd a Tervező „ettől a hónaptól” jelzését).
  const plans: Plan[] = categories.map((c) => ({ periodId: firstPeriodId, categoryId: c.id, amount: c.defaultAmount }));
  plans.find((p) => p.categoryId === 'minta-elelmiszer')!.amount = 140_000;
  plans.push({ periodId: shiftPeriod(currentId, -4), categoryId: 'minta-elelmiszer', amount: 160_000 });
  plans.push({ periodId: shiftPeriod(currentId, 2), categoryId: 'minta-ajandek', amount: 60_000 });
  // Az archivált edzőterem fél éve megszűnt.
  plans.push({ periodId: shiftPeriod(currentId, -5), categoryId: 'minta-edzoterem', amount: 0 });
  plans.push({ periodId: shiftPeriod(currentId, 3), categoryId: 'minta-ajandek', amount: 0 });
  const planOf = (catId: string, periodId: PeriodId) => {
    let amount = catOf(catId).defaultAmount;
    for (const p of plans) if (p.categoryId === `minta-${catId}` && p.periodId <= periodId) amount = p.amount;
    return amount;
  };

  const entries: Entry[] = [];
  let seq = 0;
  const add = (periodId: PeriodId, catId: string, amount: number, date: ISODate, extra: Partial<Entry> = {}) => {
    const hh = String(7 + Math.floor(rand() * 14)).padStart(2, '0');
    const mm = String(Math.floor(rand() * 60)).padStart(2, '0');
    // Az előre (jövőbeli napra) rögzített tétel is most készült: a rögzítés ideje nem lehet a jövőben.
    const stamp = new Date(`${date}T${hh}:${mm}:00`);
    entries.push({
      id: `minta-e${seq++}`, periodId, categoryId: `minta-${catId}`, amount: Math.round(amount), date,
      createdAt: (stamp > now ? new Date(now.getTime() - 3_600_000) : stamp).toISOString(), ...extra,
    });
  };
  /** Keret: a teljes összeg n részletben, véletlen napokon az időszakon belül (legfeljebb a megadott napig). */
  const spread = (periodId: PeriodId, s: CatSpec, total: number, n: number, from: ISODate, to: ISODate) => {
    if (n <= 0 || total <= 0) return;
    const days = Math.max(1, Math.round((fromISO(to).getTime() - fromISO(from).getTime()) / 86_400_000) + 1);
    const weights = Array.from({ length: n }, () => 0.4 + rand());
    const sum = weights.reduce((a, b) => a + b, 0);
    weights.forEach((w) => {
      const date = plusDays(from, Math.floor(rand() * days));
      const note = s.notes && rand() < 0.45 ? pick(s.notes) : undefined;
      add(periodId, s.id, Math.round((total * w) / sum / 10) * 10, date, note ? { note } : {});
    });
  };
  const fixDate = (c: Category, periodId: PeriodId) =>
    c.dueDay ? dueDateInPeriod(c.dueDay, periodStart(periodId, cfg), periodEnd(periodId, cfg)) ?? periodStart(periodId, cfg) : periodStart(periodId, cfg);
  // Fűtési szezonban (október–március) magasabb a gáz és az áram.
  const heating = (periodId: PeriodId) => [10, 11, 12, 1, 2, 3].includes(Number(periodId.slice(5, 7)));

  for (const periodId of periodRange(firstPeriodId, shiftPeriod(currentId, -1))) {
    const pStart = periodStart(periodId, cfg);
    const pEnd = periodEnd(periodId, cfg);
    for (const s of specs) {
      const c = catOf(s.id);
      if (c.archived && periodId > shiftPeriod(currentId, -6)) continue;
      const plan = planOf(s.id, periodId);
      if (c.type === 'keret') {
        const [min, max] = s.count ?? [1, 3];
        const n = min + Math.floor(rand() * (max - min + 1));
        const total = plan > 0 ? plan * between(szelso ? 0.95 : 0.72, szelso ? 1.35 : 1.12) : n * between(4_000, 12_000);
        spread(periodId, s, total, n, pStart, pEnd);
      } else if (c.type === 'bevetel') {
        if (c.incomeMode === 'keret') {
          if (rand() < 0.35) add(periodId, s.id, pick([8_000, 15_000, 22_500]), plusDays(pStart, 12), { note: pick(['Vatera eladás', 'Visszatérítés', 'Jutalom']) });
        } else add(periodId, s.id, plan, s.id === 'fizetes' ? pStart : plusDays(pStart, 4), { settles: true });
      } else if (c.type === 'fix') {
        if (c.autoPayFrom || !isDuePeriod(c, periodId) || plan === 0) continue;
        let amount = plan;
        if (s.id === 'aram') amount = plan * (heating(periodId) ? 1.25 : 0.85);
        if (s.id === 'gaz') amount = plan * (heating(periodId) ? 1.6 : 0.45);
        add(periodId, s.id, Math.round(amount / 10) * 10, fixDate(c, periodId), { settles: true });
      } else if (plan > 0) {
        add(periodId, s.id, plan, plusDays(pStart, 1), { settles: true });
      }
    }
    if (szelso && periodId === shiftPeriod(currentId, -3)) {
      add(periodId, 'varatlan', 2_350_000, plusDays(pStart, 6), { note: 'Autócsere – a régi motorja feladta' });
    }
  }

  // Megtakarításból fizetett költés: az autószerviz a vésztartalékból, a Közlekedés kiadásaként.
  const wId = shiftPeriod(currentId, -5);
  add(wId, 'vesztartalek', 85_000, plusDays(periodStart(wId, cfg), 9), { kind: 'withdrawal', spendCategoryId: 'minta-kozlekedes', note: 'Autószerviz #autó' });

  // A folyamatban lévő időszak, a mai napig.
  const elapsed = ELAPSED_DAYS / (Math.round((fromISO(curEnd).getTime() - fromISO(curStart).getTime()) / 86_400_000) + 1);
  const upTo = at(-1);
  add(currentId, 'fizetes', planOf('fizetes', currentId), curStart, { settles: true });
  add(currentId, 'hitel', planOf('hitel', currentId), fixDate(catOf('hitel'), currentId), { settles: true });
  // Díjváltozás: az internet a tervnél drágábban lett kifizetve.
  add(currentId, 'internet', 10_490, fixDate(catOf('internet'), currentId), { settles: true });
  add(currentId, 'vesztartalek', planOf('vesztartalek', currentId), plusDays(curStart, 1), { settles: true });
  if (szelso) add(currentId, 'lakasvasarlas', 150_000, plusDays(curStart, 1), { settles: true });
  const pace: Record<string, number> = { elelmiszer: 1.3, ruhazat: 2.1, haztartas: 0.7, kozlekedes: 0.9, gyerekek: 0.6, egeszseg: 0.4, szabadido: 0.8, egyeb: 0.5 };
  for (const s of specs) {
    if (s.type !== 'keret') continue;
    const plan = planOf(s.id, currentId);
    if (s.id === 'ajandek') {
      add(currentId, s.id, 12_000, at(-6), { note: 'Születésnap #szülinap' });
      continue;
    }
    const factor = pace[s.id] ?? (szelso ? 1.4 : 0);
    if (!factor || plan === 0) continue;
    const [min, max] = s.count ?? [1, 3];
    const n = Math.max(1, Math.round(((min + max) / 2) * elapsed));
    spread(currentId, s, plan * elapsed * factor, n, curStart, upTo);
  }
  // A legutóbbi rögzítés tegnapi, hogy a „Legutóbbi rögzítések” friss legyen, de tétlenségi teendő ne jöjjön.
  add(currentId, 'elelmiszer', 6_480, upTo, { note: 'Pékség' });
  // Előre rögzített jövőbeli tétel (az előrejelzés is számol vele).
  add(shiftPeriod(currentId, 1), 'szabadido', 48_000, plusDays(periodStart(shiftPeriod(currentId, 1), cfg), 3), { note: 'Színházjegyek #szülinap' });

  const createdAt = new Date(`${periodStart(firstPeriodId, cfg)}T09:00:00`).toISOString();
  const raw = {
    app: 'csaladi-koltsegvetes',
    schemaVersion: 1,
    // A betöltés ebből állítja a legutóbbi mentés idejét: a szélső mintánál régi mentés kell.
    exportedAt: (szelso ? new Date(now.getTime() - 45 * 86_400_000) : now).toISOString(),
    settings: {
      id: 'settings', payday, openingBalance: szelso ? -1_250_000 : 450_000, firstPeriodId, forecastPeriods: 6,
      lastSeenPeriodId: szelso ? shiftPeriod(currentId, -1) : currentId, createdAt,
    },
    periodOverrides: [],
    categories,
    plans,
    entries,
  };
  return normalizeExport(raw as unknown as Record<string, unknown>, now);
}
