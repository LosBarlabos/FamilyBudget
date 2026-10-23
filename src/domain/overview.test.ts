import { describe, expect, it } from 'vitest';
import type { PeriodSummary } from './balance';
import {
  allowanceLine, inMonth, monthStrip, negativeOutlook, negativeOutlookText, outlookSentence, remainingText, stripDescription, stripSentence,
} from './overview';
import { periodDays } from './pace';

const sp = (s: string) => s.replace(/\s/g, ' ').replace(/\u2060/g, '');
// okt. 6. hétfő – nov. 5. szerda, 31 nap; a 18. nap okt. 23.
const days = periodDays('2026-10-06', '2026-11-05', '2026-10-23');
const pace = (plan: number, left: number) => ({ days, allowance: { plan, left, perDay: null } });

describe('monthStrip', () => {
  it('az elfogyott arányt napokra váltja, és a mai nap utáni részt előreszaladtnak jelöli', () => {
    // 68% → 21 nap, a 18. napon: 3 nappal előrébb
    const s = monthStrip({ start: '2026-10-06' }, pace(100_000, 32_000));
    expect(s.days).toHaveLength(31);
    expect(s.ahead).toBe(3);
    expect(s.spentPct).toBe(68);
    expect(s.elapsedPct).toBe(58);
    expect(s.days.filter((d) => d.state === 'past')).toHaveLength(17);
    expect(s.days[17]).toMatchObject({ date: '2026-10-23', state: 'today' });
    expect(s.days.slice(18, 21).every((d) => d.state === 'ahead')).toBe(true);
    expect(s.days[21].state).toBe('future');
  });

  it('a hétvégéket jelöli', () => {
    const s = monthStrip({ start: '2026-10-06' }, pace(100_000, 50_000));
    expect(s.days[4]).toMatchObject({ date: '2026-10-10', weekend: true });
    expect(s.days[6]).toMatchObject({ date: '2026-10-12', weekend: false });
  });

  it('a túlköltés a hónap végénél áll meg, terv nélkül nincs előreszaladás', () => {
    expect(monthStrip({ start: '2026-10-06' }, pace(100_000, -20_000)).ahead).toBe(31 - 18);
    expect(monthStrip({ start: '2026-10-06' }, pace(0, 0)).ahead).toBe(-18);
  });
});

describe('stripSentence és stripDescription', () => {
  it('előrébb, mögötte, együtt', () => {
    const ahead = monthStrip({ start: '2026-10-06' }, pace(100_000, 32_000));
    expect(stripSentence(ahead)).toEqual({
      strong: '3 nappal előrébb jársz.',
      rest: 'A keretek 68%-a fogyott el, a hónap 58%-a telt el.',
      tone: 'warn',
    });
    expect(stripDescription(ahead, days)).toBe(
      'A hónap 31 napjából 18 telt el, a keretek 68 százaléka elfogyott: a költés 3 nappal előrébb jár.',
    );
    const behind = monthStrip({ start: '2026-10-06' }, pace(100_000, 60_000));
    expect(stripSentence(behind)).toMatchObject({ strong: '6 nap tartalékod van.', tone: 'ok' });
    const even = monthStrip({ start: '2026-10-06' }, pace(100_000, 42_000));
    expect(stripSentence(even).strong).toBe('Épp a terv szerint haladsz.');
  });
});

describe('a hero alsora', () => {
  it('napi összeg és hátralévő napok', () => {
    const l = allowanceLine(8000, days, '2026-11-05')!;
    expect(sp(l.lead + l.amount + l.tail)).toBe('Naponta kb. 8 000 Ft jut, még 14 napig (nov. 5-ig).');
    expect(allowanceLine(null, days, '2026-11-05')).toBeNull();
    const last = periodDays('2026-10-06', '2026-11-05', '2026-11-05');
    expect(allowanceLine(8000, last, '2026-11-05')).toBeNull();
    expect(remainingText(last, '2026-11-05')).toBe('ma van a hónap utolsó napja');
  });
});

describe('negativeOutlook', () => {
  const per = (id: string, status: PeriodSummary['status'], endBalance: number) =>
    ({ id, status, endBalance }) as PeriodSummary;

  it('a lezárt hónapokat nem nézi, az első mínuszos hónapot és a mélypontot adja', () => {
    const o = negativeOutlook({
      periods: [per('2026-09', 'closed', -5000), per('2026-10', 'current', 40_000), per('2026-12', 'future', -10_000), per('2027-01', 'future', -45_000), per('2027-02', 'future', 3000)],
    })!;
    expect(o.first.id).toBe('2026-12');
    expect(o.low.id).toBe('2027-01');
    expect(sp(negativeOutlookText(o).title)).toBe('Decemberben mínuszba fordul a futó egyenleg.');
    expect(sp(negativeOutlookText(o).sub)).toBe('A mélypont −45 000 Ft, januárban. A Tervezőben látszik, melyik hónap okozza.');
  });

  it('a folyamatban lévő hónapra külön mondat; pluszban null', () => {
    const o = negativeOutlook({ periods: [per('2026-10', 'current', -1000)] })!;
    expect(negativeOutlookText(o).title).toBe('A hónap végére mínuszba fordul a futó egyenleg.');
    expect(sp(negativeOutlookText(o).sub)).toBe('A mélypont −1 000 Ft. A Tervezőben látszik, melyik hónap okozza.');
    expect(negativeOutlook({ periods: [per('2026-10', 'current', 0)] })).toBeNull();
  });

  it('hónapnév raggal', () => {
    expect(['2027-01', '2027-03', '2027-09', '2027-10'].map(inMonth)).toEqual(['Januárban', 'Márciusban', 'Szeptemberben', 'Októberben']);
  });
});

describe('outlookSentence', () => {
  const per = (id: string, status: PeriodSummary['status'], endBalance: number) => ({ id, status, endBalance }) as PeriodSummary;

  it('a mélypont és a terv vége a folyamatban lévő hónaptól', () => {
    const s = { periods: [per('2026-09', 'closed', 100), per('2026-10', 'current', 2_500_000), per('2026-11', 'future', 2_450_000), per('2027-04', 'future', 3_010_000)] };
    expect(sp(outlookSentence(s)!)).toBe('A legalacsonyabb pont novemberben 2 450 000 Ft. A terv végén (2027. április) 3 010 000 Ft.');
  });

  it('csökkenő, a hónap végénél nem lejjebb menő és egyhónapos terv; terv nélkül null', () => {
    const down = { periods: [per('2026-10', 'current', 50_000), per('2026-11', 'future', -10_000)] };
    expect(sp(outlookSentence(down)!)).toBe('A futó egyenleg a terv végéig csökken. A terv végén (2026. november) −10 000 Ft.');
    const up = { periods: [per('2026-10', 'current', 50_000), per('2026-11', 'future', 60_000), per('2026-12', 'future', 55_000)] };
    expect(sp(outlookSentence(up)!)).toBe('A legalacsonyabb pont ennek a hónapnak a vége: 50 000 Ft. A terv végén (2026. december) 55 000 Ft.');
    expect(sp(outlookSentence({ periods: [per('2026-10', 'current', 5000)] })!)).toBe('A terv végén (2026. október) 5 000 Ft.');
    expect(outlookSentence({ periods: [per('2026-09', 'closed', 1)] })).toBeNull();
  });
});
