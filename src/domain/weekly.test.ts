import { describe, expect, it } from 'vitest';
import { computeSummaries } from './balance';
import { formatFt } from './money';
import { makeConfig, periodForDate } from './periods';
import type { BudgetData, Category, Entry } from './types';
import {
  avgName, billNames, dailyAverage, daysDescription, daysSentence, firstWeek, shiftWeek, splitSentence, weekEntries, weekRelative, weekSentence,
  weekStart, weekSummary, weekTitle,
} from './weekly';

const cfg = makeConfig(10, []);
const cat = (id: string, type: Category['type'], defaultAmount: number, extra: Partial<Category> = {}): Category => ({
  id, name: id, icon: 'dots', color: '#000', type, defaultAmount, order: 0, archived: false, ...extra,
});
let n = 0;
const entry = (date: string, categoryId: string, amount: number, extra: Partial<Entry> = {}): Entry => ({
  id: `e${n++}`, periodId: periodForDate(date, cfg), categoryId, amount, date, createdAt: `${date}T10:00:0${n % 10}Z`, ...extra,
});

// A fizetésnap 10-e: az októberi hónap okt. 10. – nov. 9., a novemberi nov. 10. – dec. 9.
// 2026. nov. 12. csütörtök, a hete nov. 9–15. (hétfőtől vasárnapig), és két hónapba esik.
const TODAY = '2026-11-12';
const THIS = '2026-11-09';
const LAST = '2026-11-02';

const categories = [
  cat('kaja', 'keret', 100_000, { name: 'Élelmiszer', order: 1 }),
  cat('auto', 'keret', 30_000, { name: 'Közlekedés', order: 2 }),
  cat('ruha', 'keret', 20_000, { name: 'Ruházat', order: 3 }),
  cat('szabad', 'keret', 0, { name: 'Szabadidő', order: 4 }),
  cat('haz', 'keret', 30_000, { name: 'Háztartás', order: 5 }),
  cat('aram', 'fix', 15_000, { name: 'Áram', dueDay: 12, order: 6 }),
  cat('net', 'fix', 8_000, { name: 'Internet', dueDay: 11, autoPayFrom: '2026-10', order: 7 }),
  cat('fiz', 'bevetel', 500_000, { name: 'Fizetés', order: 8 }),
  cat('tartalek', 'megtakaritas', 20_000, { name: 'Tartalék', order: 9 }),
];
const entries: Entry[] = [
  // A rögzítés kezdete: okt. 10. (szombat), így az okt. 5-i hét nem teljes.
  entry('2026-10-10', 'fiz', 500_000, { settles: true }),
  // Élelmiszer: okt. 12-i hét 20e, okt. 19-i 30e, okt. 26-i 0, nov. 2-i 36e; ezen a héten 25e.
  entry('2026-10-13', 'kaja', 20_000),
  entry('2026-10-20', 'kaja', 30_000),
  entry('2026-11-03', 'kaja', 36_000),
  entry('2026-11-09', 'kaja', 5_000, { note: 'pékség' }),
  entry('2026-11-11', 'kaja', 20_000, { note: 'nagybevásárlás' }),
  // Közlekedés: az első rögzítése okt. 28., előtte nincs mihez mérni.
  entry('2026-10-28', 'auto', 8_000),
  entry('2026-11-12', 'auto', 4_500),
  // Ruházat: ritka; ezen a héten csak megtakarításból.
  entry('2026-10-14', 'ruha', 12_000),
  entry('2026-11-10', 'tartalek', 40_000, { kind: 'withdrawal', spendCategoryId: 'ruha', note: 'télikabát' }),
  // Szabadidő: az előző hetekben volt, ezen a héten nem.
  entry('2026-10-13', 'szabad', 4_000),
  // Háztartás: az októberi hónap havi összeggel, novemberben már tételesen.
  entry('2026-10-31', 'haz', 30_000, { monthlyTotal: true }),
  entry('2026-11-11', 'haz', 2_000),
  // Számlák: az áram kézzel rögzítve, az internet csoportos beszedéssel (rögzítés nélkül, nov. 11-én).
  entry('2026-11-12', 'aram', 15_000, { settles: true }),
];
const data: BudgetData = {
  settings: { id: 'settings', payday: 10, openingBalance: 0, firstPeriodId: '2026-09', forecastPeriods: 2, createdAt: '2026-09-01T00:00:00Z' },
  categories,
  plans: categories.map((c) => ({ periodId: '2026-09', categoryId: c.id, amount: c.defaultAmount })),
  entries,
  overrides: [],
};
const s = computeSummaries(data, TODAY);
const week = (start: string, today = TODAY) => weekSummary(data, today === TODAY ? s : computeSummaries(data, today), cfg, start, today);

describe('a hét határai', () => {
  it('a hét hétfőtől vasárnapig tart', () => {
    expect([weekStart('2026-11-09'), weekStart(TODAY), weekStart('2026-11-15'), weekStart('2026-11-16')]).toEqual([
      THIS, THIS, THIS, '2026-11-16',
    ]);
    expect(shiftWeek(THIS, -1)).toBe(LAST);
    // Bármelyik napjával kérve ugyanaz a hét.
    expect(week('2026-11-14').start).toBe(THIS);
    expect(week(THIS).end).toBe('2026-11-15');
  });

  it('a legkorábbi hét az első rögzítés hete', () => {
    expect(firstWeek(entries, TODAY)).toBe('2026-10-05');
    expect(firstWeek([], TODAY)).toBe(THIS);
  });
});

describe('a folyamatban lévő hét', () => {
  const w = week(THIS);

  it('csak a keretekből, a havi pénzből elment költés számít, napra bontva', () => {
    expect(w.current).toBe(true);
    expect(w.total).toBe(31_500);
    expect(w.days.map((d) => d.amount)).toEqual([5_000, 0, 22_000, 4_500, 0, 0, 0]);
    expect(w.days.map((d) => d.state)).toEqual(['past', 'past', 'past', 'today', 'future', 'future', 'future']);
  });

  it('kategóriánként a költés szerint, az előző hetek átlagával', () => {
    expect(w.rows.map((r) => [r.cat.id, r.amount, r.fromSavings, r.count, r.avg, r.avgWeeks, r.more])).toEqual([
      // A megtakarításból fizetett költés a sorban látszik, de az összegbe és az átlagba nem számít.
      ['ruha', 0, 40_000, 1, 3_000, 4, false],
      // (20e + 30e + 0 + 36e) / 4: az üres hét is beleszámít.
      ['kaja', 25_000, 0, 2, 21_500, 4, true],
      // Csak az első rögzítése óta eltelt hetek: (8e + 0) / 2. A 15% megvan, az 1000 Ft-os eltérés nincs.
      ['auto', 4_500, 0, 1, 4_000, 2, false],
      // A havi összeggel rögzített hónap heteinek nincs bontása, így átlag sincs.
      ['haz', 2_000, 0, 1, null, 0, false],
    ]);
    expect(w.avgTotal).toBe(21_500 + 4_000 + 3_000 + 1_000);
    expect(w.avgWeeks).toBe(4);
  });

  it('a havi keret maradéka a mostani hónapból jön', () => {
    // A nov. 9-i rögzítés még az októberi hónapé, így a novemberi keretből csak a 20e fogyott.
    expect(w.rows.find((r) => r.cat.id === 'kaja')?.left).toBe(80_000);
    expect(w.rows.find((r) => r.cat.id === 'haz')?.left).toBe(28_000);
  });

  it('akire most nem volt költés, de szokott lenni', () => {
    expect(w.quiet.map((r) => [r.cat.id, r.avg])).toEqual([['szabad', 1_000]]);
  });

  it('a számlák külön: a rögzített és a csoportos beszedésű is', () => {
    expect(w.bills.map((b) => [b.cat.id, b.amount, b.date, b.auto])).toEqual([
      ['net', 8_000, '2026-11-11', true],
      ['aram', 15_000, '2026-11-12', false],
    ]);
    expect(w.billsTotal).toBe(23_000);
    expect(billNames(w.bills)).toBe('Internet és Áram');
  });

  it('jelzi a havi összeggel rögzített kategóriát és a hónaphatárt', () => {
    expect(w.monthly.map((c) => c.id)).toEqual(['haz']);
    expect(w.split).toEqual({ first: '2026-10', second: '2026-11', secondStart: '2026-11-10' });
    expect(splitSentence(w.split!, TODAY)).toBe(
      'A novemberi hónap ezen a héten kezdődött (nov. 10., kedd), előtte még az októberi tartott. A heti nézet a rögzítés napja szerint számol.',
    );
    expect(splitSentence(w.split!, '2026-11-09')).toBe(
      'A novemberi hónap ezen a héten kezdődik (nov. 10., kedd), addig még az októberi tart. A heti nézet a rögzítés napja szerint számol.',
    );
  });

  it('mondatok', () => {
    expect(weekSentence(w)).toEqual({
      strong: 'Még 3 nap van hátra a hétből.', rest: `Az előző 4 hét átlaga ${formatFt(29_500)} volt.`, warn: false,
    });
    expect(dailyAverage(w)).toBe(4_214);
    expect(daysSentence(w)).toEqual({
      strong: `A legtöbb szerdán ment el: ${formatFt(22_000)}.`,
      rest: `A szaggatott vonal az előző 4 hét napi átlaga, ${formatFt(4_214)}.`,
    });
    expect(daysDescription(w)).toBe(
      `A keretekből elment összeg naponta: hétfő ${formatFt(5_000)}, kedd ${formatFt(0)}, szerda ${formatFt(22_000)}, csütörtök ${formatFt(4_500)}, ` +
        'péntek még nincs adat, szombat még nincs adat, vasárnap még nincs adat.',
    );
    expect(weekSentence(week(THIS, '2026-11-15')).strong).toBe('Ma van a hét utolsó napja.');
  });
});

describe('lezárt hét', () => {
  const w = week(LAST);

  it('az átlag csak a rögzítés kezdete utáni teljes hetekből áll', () => {
    expect(w.current).toBe(false);
    expect(w.total).toBe(36_000);
    // Az okt. 5-i hét a rögzítés kezdete (okt. 10.) előtt indult: (0 + 30e + 20e) / 3.
    expect(w.rows.map((r) => [r.cat.id, r.amount, r.avg, r.avgWeeks, r.more, r.left])).toEqual([['kaja', 36_000, 16_667, 3, true, null]]);
    expect(w.quiet.map((r) => [r.cat.id, r.avg, r.avgWeeks])).toEqual([
      ['auto', 8_000, 1],
      ['ruha', 4_000, 3],
      ['szabad', 1_333, 3],
    ]);
    expect(w.avgTotal).toBe(30_000);
    expect(w.days.every((d) => d.state === 'past')).toBe(true);
    expect(w.bills).toEqual([]);
    expect(w.split).toBeNull();
    // A hét az októberi hónapba esik, amelyet a Háztartásnál havi összeggel rögzítettek.
    expect(w.monthly.map((c) => c.id)).toEqual(['haz']);
  });

  it('a mondat az átlaghoz mér', () => {
    expect(weekSentence(w)).toEqual({ strong: `${formatFt(6_000)}-tal több,`, rest: `mint az előző 3 hét átlaga (${formatFt(30_000)}).`, warn: true });
    // Az okt. 26-i héten csak a Közlekedésre volt költés: (30e + 20e) / 2 az Élelmiszer, (0 + 12e) / 2 a Ruházat, (4e + 0) / 2 a Szabadidő átlaga.
    const quietWeek = week('2026-10-26');
    expect(quietWeek.total).toBe(8_000);
    expect(weekSentence(quietWeek)).toEqual({
      strong: `${formatFt(25_000)}-tal kevesebb,`, rest: `mint az előző 2 hét átlaga (${formatFt(33_000)}).`, warn: false,
    });
  });

  it('az első héthez nincs mihez mérni', () => {
    const first = week('2026-10-12');
    expect(first.avgTotal).toBeNull();
    expect(first.rows.map((r) => [r.cat.id, r.amount, r.avg])).toEqual([['kaja', 20_000, null], ['ruha', 12_000, null], ['szabad', 4_000, null]]);
    expect(weekSentence(first)).toEqual({ strong: '', rest: 'Ehhez a héthez nincs korábbi teljes hét, amihez mérni lehetne.', warn: false });
    expect(daysSentence(first).rest).toBe('');
  });
});

describe('szélső esetek', () => {
  it('rögzítés nélkül üres', () => {
    const empty: BudgetData = { ...data, entries: [] };
    const w = weekSummary(empty, computeSummaries(empty, TODAY), cfg, THIS, TODAY);
    expect([w.total, w.avgTotal, w.rows, w.quiet, w.monthly]).toEqual([0, null, [], [], []]);
    expect(weekSentence(w).rest).toBe('Az összevetéshez legalább egy teljes hét rögzítése kell.');
    expect(daysSentence(w)).toEqual({ strong: '', rest: '' });
  });

  it('az archivált keret átlaga számít, de nem hiányolja', () => {
    const archived: BudgetData = { ...data, categories: categories.map((c) => (c.id === 'szabad' ? { ...c, archived: true } : c)) };
    const w = weekSummary(archived, computeSummaries(archived, TODAY), cfg, THIS, TODAY);
    expect(w.quiet).toEqual([]);
    expect(w.avgTotal).toBe(29_500);
  });

  it('egyetlen megelőző hétnél nem átlagról beszél', () => {
    expect(avgName(1)).toBe('az előző hét');
    expect(avgName(4)).toBe('az előző 4 hét átlaga');
  });
});

describe('a hét rögzítései és a feliratok', () => {
  it('egy kategória rögzítései a legújabbtól, a megtakarításból fizetettel, havi összeg nélkül', () => {
    expect(weekEntries(entries, 'kaja', THIS).map((e) => e.note)).toEqual(['nagybevásárlás', 'pékség']);
    expect(weekEntries(entries, 'ruha', THIS).map((e) => [e.note, e.kind])).toEqual([['télikabát', 'withdrawal']]);
    expect(weekEntries(entries, 'tartalek', THIS)).toEqual([]);
    expect(weekEntries(entries, 'haz', '2026-10-26')).toEqual([]);
  });

  it('a hét címe', () => {
    expect(weekTitle(THIS, TODAY)).toBe('nov. 9–15.');
    expect(weekTitle('2026-10-26', TODAY)).toBe('okt. 26. – nov. 1.');
    expect(weekTitle('2025-12-08', TODAY)).toBe('2025. dec. 8–14.');
    expect(weekTitle('2026-12-28', TODAY)).toBe('2026. dec. 28. – 2027. jan. 3.');
  });

  it('a hét a mához képest', () => {
    expect(weekRelative(THIS, TODAY)).toBe('ez a hét, csütörtökig');
    expect(weekRelative(THIS, '2026-11-15')).toBe('ez a hét');
    expect(weekRelative(LAST, TODAY)).toBe('múlt hét');
    expect(weekRelative('2026-10-19', TODAY)).toBe('3 héttel ezelőtt');
  });

  it('a számlák nevei', () => {
    const bill = (name: string) => ({ cat: cat(name, 'fix', 0, { name }), amount: 1, date: THIS, auto: false });
    expect(billNames([])).toBe('');
    expect(billNames([bill('Gáz')])).toBe('Gáz');
    expect(billNames([bill('Lakbér'), bill('Gáz'), bill('Telefon')])).toBe('Lakbér, Gáz és Telefon');
    expect(billNames([bill('Lakbér'), bill('Gáz'), bill('Telefon'), bill('Víz')])).toBe('Lakbér, Gáz és még 2');
  });
});
