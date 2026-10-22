import { describe, expect, it } from 'vitest';
import { computeSummaries } from './balance';
import {
  coverAllowed, coverBalanceEffect, coverEffectText, coverError, coverMessage, coverNeed, coverOps, coverPrefill,
  coverScopeText, coverSources, coverTargetText, feeDismissKey, feeSuggestions, feeSuggestionText, needsCover, withDismissal,
} from './flex';
import { paceOverview } from './pace';
import { applyPlanOps, planChangeOps } from './plans';
import { fixStatus } from './status';
import type { BudgetData, Category, Entry, Plan } from './types';

const sp = (s: string) => s.replace(/\s/g, ' ');

let order = 0;
const cat = (id: string, type: Category['type'], defaultAmount: number, extra: Partial<Category> = {}): Category => ({
  id, name: id, icon: 'dots', color: '#000', type, defaultAmount, order: order++, archived: false, ...extra,
});

let n = 0;
const entry = (periodId: string, categoryId: string, amount: number, extra: Partial<Entry> = {}): Entry => ({
  id: `e${n++}`, periodId, categoryId, amount, date: `${periodId}-15`, createdAt: '2026-10-15T10:00:00Z', ...extra,
});

// Ma: 2026-10-20 → a folyamatban lévő időszak '2026-10' (10.10–11.09., 31 nap), 11 nap eltelt.
const TODAY = '2026-10-20';

const categories = [
  cat('fiz', 'bevetel', 500_000, { name: 'Fizetés', incomeMode: 'fix' }),
  cat('aram', 'fix', 8_000, { name: 'Áram', dueDay: 15 }),
  cat('net', 'fix', 9_000, { name: 'Internet', dueDay: 20 }),
  cat('kaja', 'keret', 100_000, { name: 'Élelmiszer' }),
  cat('szabad', 'keret', 30_000, { name: 'Szabadidő' }),
  cat('ruha', 'keret', 20_000, { name: 'Ruházat' }),
  cat('varatlan', 'keret', 20_000, { name: 'Váratlan kiadások', role: 'unexpected' }),
  cat('regi', 'keret', 50_000, { name: 'Régi', archived: true }),
  cat('nyaralas', 'megtakaritas', 10_000, { name: 'Nyaralás' }),
];
const byId = new Map(categories.map((c) => [c.id, c]));
const c = (id: string) => byId.get(id)!;

const data = (entries: Entry[], plans: Plan[] = []): BudgetData => ({
  settings: { id: 'settings', payday: 10, openingBalance: 0, firstPeriodId: '2026-09', forecastPeriods: 3, createdAt: '' },
  categories, plans, entries, overrides: [],
});

const entries = [
  entry('2026-10', 'kaja', 50_000), // gyorsan fogy: a 11/31-ed idő alatt a fele elment
  entry('2026-10', 'szabad', 35_000), // 5 000 Ft-tal túllépve
  entry('2026-10', 'regi', 4_000), // archivált, de volt költése
];

function overview(es = entries, plans: Plan[] = []) {
  const s = computeSummaries(data(es, plans), TODAY);
  const p = s.byId.get(s.currentId)!;
  return { s, p, pace: paceOverview(categories, p, TODAY) };
}

describe('fedezet áthozása: ki kér és mennyit', () => {
  it('csak a folyamatban lévő és a jövőbeli időszakban, a költségvetés első időszakától', () => {
    expect(coverAllowed({ id: '2026-10', status: 'current' }, '2026-09')).toBe(true);
    expect(coverAllowed({ id: '2026-11', status: 'future' }, '2026-09')).toBe(true);
    expect(coverAllowed({ id: '2026-09', status: 'closed' }, '2026-09')).toBe(false);
    // A „következő fizetéssel indul” költségvetésnél a mostani időszakban minden terv 0, csak a tény számít.
    expect(coverAllowed({ id: '2026-10', status: 'current' }, '2026-11')).toBe(false);
  });

  it('a gyorsan fogyó, a túllépett és a terv nélkül költött keret kér fedezetet', () => {
    const { pace } = overview([...entries, entry('2026-10', 'varatlan', 3_000)], [{ periodId: '2026-09', categoryId: 'varatlan', amount: 0 }]);
    expect(needsCover(pace.byId.get('kaja')!, pace)).toBe(true);
    expect(needsCover(pace.byId.get('szabad')!, pace)).toBe(true);
    expect(needsCover(pace.byId.get('varatlan')!, pace)).toBe(true);
    expect(needsCover(pace.byId.get('ruha')!, pace)).toBe(false);
    // Az archivált keret sora már nem látszik, nincs mit fedezni.
    expect(needsCover(pace.byId.get('regi')!, pace)).toBe(false);
  });

  it('ha egyik keretnek sincs terve, a terv nélküli költés nem kér fedezetet (nem lenne honnan)', () => {
    const zero = ['kaja', 'szabad', 'ruha', 'varatlan'].map((id) => ({ periodId: '2026-09', categoryId: id, amount: 0 }));
    const { pace } = overview([entry('2026-10', 'kaja', 5_000)], zero);
    expect(pace.hasPlan).toBe(false);
    expect(needsCover(pace.byId.get('kaja')!, pace)).toBe(false);
  });

  it('túllépésnél a túllépés, gyors fogyásnál a várható túllépés 100 Ft-ra felfelé', () => {
    const { pace } = overview();
    expect(coverNeed(pace.byId.get('szabad')!)).toBe(5_000);
    // 50 000 / (11/31) = 140 909 → ~40 909 Ft túllépés várható
    expect(coverNeed(pace.byId.get('kaja')!)).toBe(41_000);
    expect(coverNeed({ plan: 0, actual: 8_000, expectedOver: 8_000 })).toBe(8_000);
    // Az időszak első napjaiban nincs vetítés: nincs mit előtölteni.
    expect(coverNeed({ plan: 100_000, actual: 30_000, expectedOver: -70_000 })).toBe(0);
  });

  it('forrás: a maradékos keretek, a cél, az archivált és a túllépett nélkül, a maradék szerint', () => {
    const { pace } = overview([...entries, entry('2026-10', 'ruha', 5_000)]);
    const src = coverSources(pace, 'szabad');
    expect(src.map((s) => [s.cat.id, s.left])).toEqual([
      ['kaja', 50_000],
      ['varatlan', 20_000],
      ['ruha', 15_000],
    ]);
    expect(coverSources(pace, 'kaja').map((s) => s.cat.id)).toEqual(['varatlan', 'ruha']);
  });

  it('az előtöltött összeg a túllépés, vagy ha a forrás maradéka kisebb, az', () => {
    expect(coverPrefill(5_000, 18_000)).toBe(5_000);
    expect(coverPrefill(41_000, 18_000)).toBe(18_000);
    expect(coverPrefill(0, 18_000)).toBe(0);
  });

  it('a forrás maradékánál több nem hozható át', () => {
    const src = { cat: c('szabad'), left: 18_000 };
    expect(coverError(18_000, src)).toBeNull();
    expect(sp(coverError(18_001, src)!)).toBe('A Szabadidő keretben csak 18 000 Ft maradt');
    expect(sp(coverError(1, { cat: c('kaja'), left: 0 })!)).toBe('Az Élelmiszer keretben csak 0 Ft maradt');
    expect(coverError(0, src)).toBe('Adj meg egy összeget');
    expect(coverError(12.5, src)).toBe('Adj meg egy összeget');
  });
});

describe('fedezet áthozása: a két terv-művelet', () => {
  it('a forrás terve csökken, a célé nő, csak erre az időszakra', () => {
    const { ops, fromPlan, toPlan } = coverOps([], c('ruha'), c('szabad'), '2026-10', 5_000, 0, '2026-09');
    expect(fromPlan).toBe(15_000);
    expect(toPlan).toBe(35_000);
    const after = overview(entries, applyPlanOps([], ops));
    const fig = (p: string, id: string) => after.s.byId.get(p)!.byCategory.get(id)!.plan;
    expect(fig('2026-10', 'ruha')).toBe(15_000);
    expect(fig('2026-10', 'szabad')).toBe(35_000);
    // Nincs maradék-átvitel: a következő időszak a korábbi terveket kapja.
    expect(fig('2026-11', 'ruha')).toBe(20_000);
    expect(fig('2026-11', 'szabad')).toBe(30_000);
    expect(fig('2027-01', 'szabad')).toBe(30_000);
    // A túllépés megszűnt (a keret elfogyott, így még gyorsan fogyónak számít).
    expect(after.pace.byId.get('szabad')!.pace).toBe('fast');
    expect(after.pace.byId.get('szabad')!.left).toBe(0);
  });

  it('a már meglévő későbbi egyedi terv megmarad', () => {
    const plans: Plan[] = [
      { periodId: '2026-09', categoryId: 'kaja', amount: 100_000 },
      { periodId: '2026-11', categoryId: 'kaja', amount: 120_000 },
    ];
    const { ops } = coverOps(plans, c('kaja'), c('szabad'), '2026-10', 10_000, 50_000, '2026-09');
    const next = applyPlanOps(plans, ops);
    expect(next).toContainEqual({ periodId: '2026-10', categoryId: 'kaja', amount: 90_000 });
    expect(next).toContainEqual({ periodId: '2026-11', categoryId: 'kaja', amount: 120_000 });
    expect(ops.del).toEqual([]);
  });

  it('ismételt áthozás ugyanabban az időszakban a már átírt tervből indul', () => {
    const first = applyPlanOps([], coverOps([], c('ruha'), c('szabad'), '2026-10', 5_000, 0, '2026-09').ops);
    const second = applyPlanOps(first, coverOps(first, c('ruha'), c('szabad'), '2026-10', 3_000, 0, '2026-09').ops);
    const s = overview(entries, second).s;
    expect(s.byId.get('2026-10')!.byCategory.get('ruha')!.plan).toBe(12_000);
    expect(s.byId.get('2026-10')!.byCategory.get('szabad')!.plan).toBe(38_000);
    expect(s.byId.get('2026-11')!.byCategory.get('ruha')!.plan).toBe(20_000);
    expect(s.byId.get('2026-11')!.byCategory.get('szabad')!.plan).toBe(30_000);
  });

  it('a forrás maradékánál többet és önmagának nem ad', () => {
    expect(() => coverOps([], c('ruha'), c('szabad'), '2026-10', 15_001, 5_000, '2026-09')).toThrow('csak 15');
    expect(() => coverOps([], c('ruha'), c('ruha'), '2026-10', 1_000, 0, '2026-09')).toThrow();
    expect(() => coverOps([], c('ruha'), c('szabad'), '2026-10', 0, 0, '2026-09')).toThrow();
  });

  it('gyors fogyásnál a futó egyenleg és a még elkölthető összeg nem változik', () => {
    const before = overview();
    const { ops } = coverOps([], c('ruha'), c('kaja'), '2026-10', 10_000, 0, '2026-09');
    const after = overview(entries, applyPlanOps([], ops));
    for (const id of ['2026-10', '2026-11', '2027-01']) {
      expect(after.s.byId.get(id)!.endBalance).toBe(before.s.byId.get(id)!.endBalance);
    }
    expect(after.pace.allowance.left).toBe(before.pace.allowance.left);
    const kaja = before.p.byCategory.get('kaja')!;
    const ruha = before.p.byCategory.get('ruha')!;
    expect(coverBalanceEffect(kaja, ruha, 10_000)).toBe(0);
  });

  it('túllépésnél az előrejelzés a fedezett túllépéssel javul (a túllépés eddig is benne volt)', () => {
    const before = overview();
    const { ops } = coverOps([], c('ruha'), c('szabad'), '2026-10', 5_000, 0, '2026-09');
    const after = overview(entries, applyPlanOps([], ops));
    const delta = after.s.byId.get('2026-10')!.endBalance - before.s.byId.get('2026-10')!.endBalance;
    const szabad = before.p.byCategory.get('szabad')!;
    const ruha = before.p.byCategory.get('ruha')!;
    expect(delta).toBe(5_000);
    expect(coverBalanceEffect(szabad, ruha, 5_000)).toBe(5_000);
    // A túllépésen felüli rész már terv-átrendezés: csak a túllépés javít.
    expect(coverBalanceEffect(szabad, ruha, 8_000)).toBe(5_000);
    // A még elkölthető összeg (napi keretek maradéka) nem változik.
    expect(after.pace.allowance.left).toBe(before.pace.allowance.left);
  });

  it('a napi összegen kívüli forrásból a még elkölthető összeg nő', () => {
    const before = overview();
    const { ops } = coverOps([], c('varatlan'), c('szabad'), '2026-10', 5_000, 0, '2026-09');
    const after = overview(entries, applyPlanOps([], ops));
    expect(after.pace.allowance.left - before.pace.allowance.left).toBe(5_000);
  });
});

describe('fedezet áthozása: szövegek', () => {
  it('a hatás mondata', () => {
    expect(coverEffectText(0, 'Szabadidő')).toBe('A futó egyenleg nem változik, csak átrendeződik.');
    expect(sp(coverEffectText(5_000, 'Élelmiszer'))).toBe(
      'A tervek összege nem változik, csak átrendeződik. A futó egyenleg mégis +5 000 Ft-tal javul: a túllépés eddig is benne volt, az Élelmiszer keretből viszont ennyivel kevesebbet számol.',
    );
  });

  it('a hatály, a keret állása és az üzenet', () => {
    expect(coverScopeText('2026-10')).toBe('Csak októberre szól, novembertől mindkét keret a korábbi tervével folytatódik.');
    expect(coverScopeText('2026-12')).toBe('Csak decemberre szól, januártól mindkét keret a korábbi tervével folytatódik.');
    expect(sp(coverTargetText({ plan: 30_000, actual: 35_000, expectedOver: 5_000 }))).toBe('túllépés 5 000 Ft');
    expect(sp(coverTargetText({ plan: 100_000, actual: 50_000, expectedOver: 40_909 }))).toBe('~40 900 Ft túllépés várható');
    expect(sp(coverTargetText({ plan: 0, actual: 8_000, expectedOver: 8_000 }))).toBe('terv nélkül 8 000 Ft');
    expect(sp(coverTargetText({ plan: 100_000, actual: 30_000, expectedOver: -70_000 }))).toBe('maradt 70 000 Ft');
    expect(sp(coverMessage(c('ruha'), c('szabad'), 5_000, '2026-10'))).toBe('5 000 Ft áthozva: Ruházat → Szabadidő · csak októberre');
  });
});

describe('díjváltozás-javaslat', () => {
  const sugg = (es: Entry[], opts: { plans?: Plan[]; dismissed?: string[]; periodId?: string; cats?: Category[] } = {}) => {
    const d = { ...data(es, opts.plans ?? []), categories: opts.cats ?? categories };
    const s = computeSummaries(d, TODAY);
    return feeSuggestions(d.categories, s.byId.get(opts.periodId ?? s.currentId)!, d.plans, d.settings.firstPeriodId, opts.dismissed ?? []);
  };

  it('a tervtől eltérő összeggel lezárt fix számlánál az új díjat javasolja', () => {
    expect(sugg([entry('2026-10', 'aram', 8_350, { settles: true })])).toEqual(new Map([['aram', 8_350]]));
    // Kevesebbel lezárva is.
    expect(sugg([entry('2026-10', 'aram', 7_900, { settles: true })])).toEqual(new Map([['aram', 7_900]]));
    // A tervnél többel, lezárás nélkül is kész (kifizetve, eltér).
    expect(sugg([entry('2026-10', 'aram', 5_000), entry('2026-10', 'aram', 3_500)])).toEqual(new Map([['aram', 8_500]]));
  });

  it('nem javasol: a tervvel egyező, a részleges, a „Nem volt” és a nem számla tételnél', () => {
    expect(sugg([entry('2026-10', 'aram', 8_000, { settles: true })]).size).toBe(0);
    expect(sugg([entry('2026-10', 'aram', 5_000)]).size).toBe(0);
    expect(sugg([entry('2026-10', 'aram', 0, { settles: true })]).size).toBe(0);
    expect(sugg([entry('2026-10', 'fiz', 520_000, { settles: true }), entry('2026-10', 'nyaralas', 15_000, { settles: true })]).size).toBe(0);
  });

  it('lezárt időszakban és az első időszak előtt nem javasol, a jövőbeliben igen', () => {
    expect(sugg([entry('2026-09', 'aram', 8_350, { settles: true })], { periodId: '2026-09' }).size).toBe(0);
    const closed = { ...data([entry('2026-09', 'aram', 8_350, { settles: true })]) };
    const s = computeSummaries(closed, '2026-11-20');
    expect(feeSuggestions(categories, s.byId.get('2026-09')!, [], '2026-09', []).size).toBe(0);
    expect(sugg([entry('2026-11', 'aram', 8_350, { settles: true })], { periodId: '2026-11' }).size).toBe(1);
    // Az első időszak előtt 0 a terv, ott minden kifizetett számla eltérne.
    const pre = computeSummaries({ ...data([entry('2026-08', 'aram', 8_350, { settles: true })]) }, '2026-08-20');
    expect(feeSuggestions(categories, pre.byId.get('2026-08')!, [], '2026-09', []).size).toBe(0);
  });

  it('az elutasítás időszakonként és kategóriánként érvényes', () => {
    const es = [entry('2026-10', 'aram', 8_350, { settles: true }), entry('2026-10', 'net', 9_500, { settles: true })];
    expect([...sugg(es, { dismissed: [feeDismissKey('2026-10', 'aram')] }).keys()]).toEqual(['net']);
    expect(sugg(es, { dismissed: [feeDismissKey('2026-09', 'aram')] }).size).toBe(2);
  });

  it('nem javasol, ha a következő időszak terve már az új díj', () => {
    const plans: Plan[] = [{ periodId: '2026-11', categoryId: 'aram', amount: 8_350 }];
    expect(sugg([entry('2026-10', 'aram', 8_350, { settles: true })], { plans }).size).toBe(0);
  });

  it('elfogadva („ettől a hónaptól”) a számla kifizetett lesz, és a javaslat eltűnik', () => {
    const es = [entry('2026-10', 'aram', 8_350, { settles: true })];
    const plans = applyPlanOps([], planChangeOps([], c('aram'), '2026-10', 8_350, 'from'));
    const s = computeSummaries(data(es, plans), TODAY);
    const f = s.byId.get('2026-10')!.byCategory.get('aram')!;
    expect(fixStatus(f.plan, f.actual, f.settled)).toBe('paid');
    expect(s.byId.get('2026-12')!.byCategory.get('aram')!.plan).toBe(8_350);
    expect(sugg(es, { plans }).size).toBe(0);
  });

  it('archivált számlánál nem javasol', () => {
    const cats = categories.map((x) => (x.id === 'aram' ? { ...x, archived: true } : x));
    expect(sugg([entry('2026-10', 'aram', 8_350, { settles: true })], { cats }).size).toBe(0);
  });

  it('az elutasítások listája nem nő a végtelenségig, és nem duplikál', () => {
    expect(withDismissal(['a', 'b'], 'a')).toEqual(['b', 'a']);
    expect(withDismissal(['a', 'b', 'c'], 'd', 3)).toEqual(['b', 'c', 'd']);
  });

  it('a javaslat szövege', () => {
    expect(sp(feeSuggestionText(8_350))).toBe('Új díj: 8 350 Ft. Legyen ez a terv ettől a hónaptól?');
  });
});
