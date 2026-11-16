import { describe, expect, it } from 'vitest';
import {
  applyEdit, categoryChoices, draftOf, editErrors, editLimits, editNotes, editScope, entryChanged, entryTotals, filterEntries, groupByDay, NO_FILTER,
  spendChoices, totalsText,
} from './entries';
import { formatFt } from './money';
import { makeConfig, periodForDate } from './periods';
import type { Category, Entry } from './types';

// A fizetésnap 10-e: az októberi hónap okt. 10. – nov. 9., a novemberi nov. 10. – dec. 9.
const cfg = makeConfig(10, []);
const TODAY = '2026-11-14';
const cat = (id: string, type: Category['type'], order: number, extra: Partial<Category> = {}): Category => ({
  id, name: id, icon: 'dots', color: '#000', type, defaultAmount: 0, order, archived: false, ...extra,
});
let n = 0;
const entry = (id: string, date: string, categoryId: string, amount: number, extra: Partial<Entry> = {}): Entry => ({
  id, periodId: periodForDate(date, cfg), categoryId, amount, date, createdAt: `${date}T10:00:0${n++}Z`, ...extra,
});

const categories = [
  cat('kaja', 'keret', 1, { name: 'Élelmiszer' }),
  cat('auto', 'keret', 2, { name: 'Közlekedés' }),
  cat('regi', 'keret', 3, { name: 'Régi keret', archived: true }),
  cat('aram', 'fix', 4, { name: 'Áram' }),
  cat('net', 'fix', 5, { name: 'Internet' }),
  cat('fiz', 'bevetel', 6, { name: 'Fizetés' }),
  cat('mellek', 'bevetel', 7, { name: 'Mellékes', incomeMode: 'keret' }),
  cat('tartalek', 'megtakaritas', 8, { name: 'Tartalék' }),
];
const e1 = entry('e1', '2026-11-12', 'kaja', 5_000, { note: 'pékség #reggeli', createdBy: 'Anna' });
const e2 = entry('e2', '2026-11-11', 'kaja', 20_000, { note: 'nagybevásárlás' });
const e3 = entry('e3', '2026-11-12', 'aram', 15_000, { settles: true });
const e4 = entry('e4', '2026-11-10', 'fiz', 500_000, { settles: true });
const e5 = entry('e5', '2026-11-10', 'tartalek', 20_000, { settles: true });
const e6 = entry('e6', '2026-11-11', 'tartalek', 40_000, { kind: 'withdrawal', spendCategoryId: 'auto', note: 'szerviz' });
const e7 = entry('e7', '2026-10-31', 'kaja', 90_000, { monthlyTotal: true });
const e8 = entry('e8', '2026-10-20', 'auto', 8_000, { createdBy: 'Bence' });
const entries = [e1, e2, e3, e4, e5, e6, e7, e8];
const ids = (list: Entry[]) => list.map((e) => e.id);
const filter = (f: Partial<typeof NO_FILTER>) => ids(filterEntries(entries, categories, { ...NO_FILTER, ...f }));

describe('a rögzítések listája', () => {
  it('a legújabbtól: nap, azon belül a rögzítés ideje szerint', () => {
    expect(filter({})).toEqual(['e3', 'e1', 'e6', 'e2', 'e5', 'e4', 'e7', 'e8']);
    expect(groupByDay(filterEntries(entries, categories, NO_FILTER)).map((g) => [g.date, ids(g.entries)])).toEqual([
      ['2026-11-12', ['e3', 'e1']],
      ['2026-11-11', ['e6', 'e2']],
      ['2026-11-10', ['e5', 'e4']],
      ['2026-10-31', ['e7']],
      ['2026-10-20', ['e8']],
    ]);
  });

  it('szűrés hónapra, kategóriára és típusra', () => {
    expect(filter({ periodId: '2026-10' })).toEqual(['e7', 'e8']);
    // A megtakarításból fizetett költés annál a kategóriánál és típusnál is látszik, amire költötték.
    expect(filter({ scope: 'c:auto' })).toEqual(['e6', 'e8']);
    expect(filter({ scope: 't:keret' })).toEqual(['e1', 'e6', 'e2', 'e7', 'e8']);
    expect(filter({ scope: 't:megtakaritas' })).toEqual(['e6', 'e5']);
    expect(filter({ scope: 't:fix', periodId: '2026-10' })).toEqual([]);
  });

  it('keresés megjegyzésben, kategórianévben, névben és címkére', () => {
    expect(filter({ query: 'ANNA' })).toEqual(['e1']);
    expect(filter({ query: '#reggeli' })).toEqual(['e1']);
    expect(filter({ query: '#regg' })).toEqual([]);
    expect(filter({ query: 'szerv' })).toEqual(['e6']);
    expect(filter({ query: 'közlekedés' })).toEqual(['e6', 'e8']);
    expect(filter({ query: 'élelmiszer', periodId: '2026-11' })).toEqual(['e1', 'e2']);
    expect(filter({ query: '  ' }).length).toBe(8);
  });

  it('összegzés típusonként', () => {
    const t = entryTotals(entries, categories);
    expect(t).toEqual({ count: 8, expense: 138_000, income: 500_000, saved: 20_000, fromSavings: 40_000 });
    expect(totalsText(t)).toBe(
      `8 rögzítés · kiadás ${formatFt(138_000)} · bevétel ${formatFt(500_000)} · félretéve ${formatFt(20_000)} · megtakarításból ${formatFt(40_000)}`,
    );
    expect(totalsText(entryTotals([e8], categories))).toBe(`1 rögzítés · kiadás ${formatFt(8_000)}`);
    expect(totalsText(entryTotals([], categories))).toBe('0 rögzítés');
  });
});

describe('mi szerkeszthető', () => {
  const c = (id: string) => categories.find((x) => x.id === id);

  it('a havi összeg napja és kategóriája kötött, a megtakarítás a céljához tartozik', () => {
    expect(editScope(e1, c('kaja'))).toEqual({ date: true, category: true, spend: false });
    expect(editScope(e4, c('fiz'))).toEqual({ date: true, category: true, spend: false });
    expect(editScope(e5, c('tartalek'))).toEqual({ date: true, category: false, spend: false });
    expect(editScope(e6, c('tartalek'))).toEqual({ date: true, category: false, spend: true });
    expect(editScope(e7, c('kaja'))).toEqual({ date: false, category: false, spend: false });
    // Már nem létező kategória: az összeg, a nap és a megjegyzés még javítható.
    expect(editScope(e1, undefined)).toEqual({ date: true, category: false, spend: false });
  });

  it('kiadás csak kiadásba, bevétel csak bevételbe; az archivált csak akkor, ha a rögzítés most ott van', () => {
    expect(ids2(categoryChoices(e1, categories))).toEqual(['kaja', 'auto', 'aram', 'net']);
    expect(ids2(categoryChoices(e3, categories))).toEqual(['kaja', 'auto', 'aram', 'net']);
    expect(ids2(categoryChoices({ ...e1, categoryId: 'regi' }, categories))).toEqual(['kaja', 'auto', 'regi', 'aram', 'net']);
    expect(ids2(categoryChoices(e4, categories))).toEqual(['fiz', 'mellek']);
    expect(ids2(categoryChoices(e5, categories))).toEqual(['tartalek']);
    expect(ids2(categoryChoices(e7, categories))).toEqual(['kaja']);
    expect(categoryChoices({ ...e1, categoryId: 'nincs' }, categories)).toEqual([]);
    expect(ids2(spendChoices(e6, categories))).toEqual(['kaja', 'auto', 'aram', 'net']);
    expect(ids2(spendChoices({ ...e6, spendCategoryId: 'regi' }, categories))).toEqual(['kaja', 'auto', 'regi', 'aram', 'net']);
  });

  it('a nap a költségvetés kezdetétől máig állítható, a felhasználás a cél egyenlegéig', () => {
    expect(editLimits(e1, '2026-09-10', TODAY, null)).toEqual({ minDate: '2026-09-10', maxDate: TODAY, maxAmount: null });
    // A cél egyenlege a felhasználás után 30e: e nélkül 70e lenne rajta.
    expect(editLimits(e6, '2026-09-10', TODAY, 30_000).maxAmount).toBe(70_000);
    expect(editLimits(e5, '2026-09-10', TODAY, 30_000).maxAmount).toBeNull();
    // A jövőbe előre rögzített és a kezdet előtti tétel a saját napján maradhat.
    expect(editLimits({ ...e1, date: '2026-12-01' }, '2026-09-10', TODAY, null).maxDate).toBe('2026-12-01');
    expect(editLimits({ ...e1, date: '2026-08-01' }, '2026-09-10', TODAY, null).minDate).toBe('2026-08-01');
  });

  it('hibák', () => {
    const limits = editLimits(e1, '2026-09-10', TODAY, null);
    const d = draftOf(e1);
    expect(editErrors(e1, d, limits)).toEqual({});
    expect(editErrors(e1, { ...d, amount: null }, limits)).toEqual({ amount: 'Adj meg egy érvényes összeget' });
    expect(editErrors(e1, { ...d, amount: 0 }, limits).amount).toBeDefined();
    // 0 Ft csak lezárásként értelmes („Nem volt”).
    expect(editErrors(e3, { ...draftOf(e3), amount: 0 }, limits)).toEqual({});
    expect(editErrors(e1, { ...d, date: '2026-11-15' }, limits)).toEqual({ date: 'Jövőbeli nap nem adható meg' });
    expect(editErrors(e1, { ...d, date: '2026-09-09' }, limits)).toEqual({ date: 'A költségvetés kezdete (szep. 10.) előtti nap nem adható meg' });
    expect(editErrors(e1, { ...d, date: '' }, limits)).toEqual({ date: 'Adj meg egy napot' });
    expect(editErrors(e6, { ...draftOf(e6), amount: 70_001 }, editLimits(e6, '2026-09-10', TODAY, 30_000))).toEqual({
      amount: `Ezen a megtakarításon csak ${formatFt(70_000)} van`,
    });
    // A havi összegnek nincs állítható napja.
    expect(editErrors(e7, { ...draftOf(e7), date: '' }, limits)).toEqual({});
  });
});

const ids2 = (list: Category[]) => list.map((c) => c.id);

describe('a módosítás alkalmazása', () => {
  const edit = (e: Entry, patch: Partial<ReturnType<typeof draftOf>>) =>
    applyEdit(e, { ...draftOf(e), ...patch } as ReturnType<typeof draftOf> & { amount: number }, categories, cfg);

  it('a hónap a dátumot követi, de csak ha a dátum változik', () => {
    expect(edit(e1, { date: '2026-11-10' }).periodId).toBe('2026-11');
    expect(edit(e1, { date: '2026-11-09' })).toMatchObject({ date: '2026-11-09', periodId: '2026-10', id: 'e1', createdAt: e1.createdAt });
    // Az előző hónapba rögzített, de a hónapon kívüli napú régi tétel a helyén marad, amíg a napját nem állítják át.
    const odd = { ...e1, periodId: '2026-10' };
    expect(edit(odd, { amount: 6_000 })).toMatchObject({ amount: 6_000, periodId: '2026-10' });
  });

  it('az összeg, a megjegyzés és a kategória', () => {
    expect(edit(e1, { amount: 5_500, note: '  kifli  ' })).toMatchObject({ amount: 5_500, note: 'kifli', categoryId: 'kaja', createdBy: 'Anna' });
    expect(edit(e1, { note: '   ' }).note).toBeUndefined();
    expect(edit(e1, { categoryId: 'auto' }).categoryId).toBe('auto');
    // Nem választható kategória (bevétel) nem kerülhet a kiadásra.
    expect(edit(e1, { categoryId: 'fiz' }).categoryId).toBe('kaja');
  });

  it('a lezárás jelzője csak fix tételnél marad meg', () => {
    expect(edit(e3, { amount: 16_000 }).settles).toBe(true);
    expect(edit(e3, { categoryId: 'net' }).settles).toBe(true);
    expect(edit(e3, { categoryId: 'kaja' }).settles).toBeUndefined();
    // A részletekben érkező bevétel keretként rögzül, ott sincs lezárás.
    expect(edit(e4, { categoryId: 'mellek' }).settles).toBeUndefined();
  });

  it('a megtakarítás és a havi összeg kötöttségei', () => {
    expect(edit(e6, { spendCategoryId: 'kaja', categoryId: 'kaja' })).toMatchObject({ categoryId: 'tartalek', spendCategoryId: 'kaja', kind: 'withdrawal' });
    expect(edit(e6, { spendCategoryId: '' }).spendCategoryId).toBeUndefined();
    expect(edit(e7, { amount: 95_000, date: '2026-11-01', categoryId: 'auto' })).toMatchObject({
      amount: 95_000, date: '2026-10-31', periodId: '2026-10', categoryId: 'kaja', monthlyTotal: true,
    });
  });

  it('változott-e, és mit érint', () => {
    expect(entryChanged(e1, edit(e1, {}))).toBe(false);
    expect(entryChanged(e1, edit(e1, { note: 'pékség #reggeli ' }))).toBe(false);
    expect(entryChanged(e1, edit(e1, { amount: 5_001 }))).toBe(true);
    expect(entryChanged(e3, edit(e3, { categoryId: 'kaja' }))).toBe(true);
    expect(editNotes(e1, edit(e1, { amount: 6_000 }), '2026-11')).toEqual([]);
    expect(editNotes(e1, edit(e1, { date: '2026-11-09' }), '2026-11')).toEqual([
      'Az októberi hónapba kerül át.',
      'Lezárt hónapot érint: a hónap összege és a futó egyenleg is változik.',
    ]);
    expect(editNotes(e8, edit(e8, { amount: 9_000 }), '2026-11')).toEqual(['Lezárt hónapot érint: a hónap összege és a futó egyenleg is változik.']);
  });
});
