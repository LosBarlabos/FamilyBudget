import { describe, expect, it } from 'vitest';
import { computeSummaries } from './balance';
import { parseImport } from './exportFormat';
import { goalProgress } from './goals';
import { paceOverview } from './pace';
import { buildSample, SAMPLE_KINDS } from './sample';
import { buildTodos, dueBills } from './todos';
import type { BudgetData } from './types';

const data = (f: ReturnType<typeof buildSample>): BudgetData => ({
  settings: f.settings, categories: f.categories, plans: f.plans, entries: f.entries, overrides: f.periodOverrides,
});

// Több „ma”: hónap eleje, vége, szökőnap és évforduló körül is ugyanolyan állapotot kell adnia.
const DAYS = ['2026-10-22', '2026-03-01', '2028-02-29', '2027-01-03', '2026-12-31', '2026-07-15'];

describe('buildSample', () => {
  it.each(SAMPLE_KINDS)('%s: a mentés formátumában van, és visszatölthető', (kind) => {
    const now = new Date('2026-10-22T12:00:00');
    const f = buildSample(kind, now);
    expect(() => parseImport(JSON.stringify(f), now)).not.toThrow();
    expect(buildSample(kind, now)).toEqual(f);
  });

  it.each(DAYS)('teljes, %s: a folyamatban lévő időszak 18. napja, a felméréshez kellő állapotokkal', (day) => {
    const now = new Date(`${day}T12:00:00`);
    const f = buildSample('teljes', now);
    const d = data(f);
    const s = computeSummaries(d, day);
    const cur = s.byId.get(s.currentId)!;
    expect(s.periods.filter((p) => p.status === 'closed')).toHaveLength(14);
    expect(Math.round((new Date(`${day}T00:00:00`).getTime() - new Date(`${cur.start}T00:00:00`).getTime()) / 86_400_000)).toBe(17);

    const pace = paceOverview(d.categories, cur, day);
    const byName = (n: string) => pace.envelopes.find((e) => e.cat.name === n)!;
    expect(byName('Élelmiszer').pace).toBe('fast');
    expect(byName('Ruházat').pace).toBe('over');
    expect(pace.unplanned.map((e) => e.cat.name)).toContain('Ajándék');

    const bills = dueBills(d.categories, cur, day);
    expect(bills.find((b) => b.cat.name === 'Áram')?.overdue).toBe(true);
    expect(bills.find((b) => b.cat.name === 'Gáz')?.overdue).toBe(false);

    const goals = d.categories.filter((c) => c.goalAmount).map((cat) => ({ cat, g: goalProgress(cat, d, s.currentId) }));
    expect(goals.find((x) => x.cat.name === 'Nyaralás 2027')?.g.state).toBe('behind');
    expect(goals.find((x) => x.cat.name === 'Vésztartalék')?.g.state).toBe('onTrack');

    const todos = buildTodos({
      categories: d.categories, entries: d.entries, period: cur, pace, today: day, goals,
      createdAt: d.settings.createdAt, backup: { stale: false, days: 0 },
    });
    const kinds = todos.map((t) => t.kind);
    expect(kinds).toContain('bill');
    expect(kinds).toContain('income');
    expect(kinds).not.toContain('idle');
    expect(s.periods.at(-1)!.endBalance).toBeGreaterThan(0);
    expect(f.entries.every((e) => new Date(e.createdAt) <= now)).toBe(true);
  });

  it.each(DAYS)('szelso, %s: negatív egyenleg, 40 kategória, nyolcjegyű összeg, havi zárás', (day) => {
    const f = buildSample('szelso', new Date(`${day}T12:00:00`));
    const s = computeSummaries(data(f), day);
    expect(f.categories.filter((c) => !c.archived)).toHaveLength(40);
    expect(s.byId.get(s.currentId)!.endBalance).toBeLessThan(0);
    expect(Math.max(...f.entries.map((e) => e.amount), ...f.categories.map((c) => c.goalAmount ?? 0))).toBeGreaterThanOrEqual(10_000_000);
    expect(f.settings.lastSeenPeriodId! < s.currentId).toBe(true);
    expect(f.categories.some((c) => c.name.length > 50)).toBe(true);
  });
});
