import {
  BarElement, CategoryScale, Chart as ChartJS, Filler, LinearScale, LineElement, PointElement, Tooltip,
  type ChartData, type ChartOptions,
} from 'chart.js';
import { useMemo } from 'react';
import { Bar as BarChart, Line } from 'react-chartjs-2';
import type { Summaries } from '../../domain/balance';
import { formatFt, formatShort } from '../../domain/money';
import { periodName, periodShortLabel, periodShortName } from '../../domain/periods';
import { savingsSpend, type TrendPoint } from '../../domain/analysis';
import type { Category, Entry, PeriodId } from '../../domain/types';
import { isExpense } from '../../domain/types';
import { displayUnits } from '../../domain/units';
import { withAlpha } from '../color';
import { useColorScheme, useReducedMotion } from './common';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Filler);

/**
 * A grafikonok színei a CSS-tokenekből (tokens.css: --chart-*, --color-accent, --color-surface), a betű a törzsszövegé.
 * A téma váltásakor (rendszer vagy kézi választás) újraolvassa őket; csökkentett mozgásnál nincs animáció.
 */
function useChartTheme() {
  const scheme = useColorScheme();
  const reduced = useReducedMotion();
  return useMemo(() => {
    const cs = getComputedStyle(document.documentElement);
    const v = (name: string) => cs.getPropertyValue(name).trim();
    // A Chart.js a betűt a globális alapértékből veszi (tengelyfeliratok, súgó).
    ChartJS.defaults.font.family = v('--font-body');
    return {
      grid: v('--chart-grid'), tick: v('--chart-tick'), faint: v('--chart-faint'), zero: v('--chart-zero'),
      surface: v('--color-surface'), accent: v('--color-accent'), reduced,
    };
    // A scheme csak újraolvasási jel: a tényleges érték a dokumentum stílusából jön.
  }, [scheme, reduced]);
}


function baseOptions(t: ReturnType<typeof useChartTheme>, onSelect: (i: number) => void): ChartOptions<'line' | 'bar'> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: t.reduced ? false : { duration: 250 },
    interaction: { mode: 'index', intersect: false },
    onClick: (_e, els) => {
      if (els.length) onSelect(els[0].index);
    },
    onHover: (e, els) => {
      const target = e.native?.target as HTMLElement | undefined;
      if (target) target.style.cursor = els.length ? 'pointer' : 'default';
    },
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { display: false }, ticks: { color: t.tick, autoSkip: true, autoSkipPadding: 6, maxRotation: 0 }, border: { color: t.grid } },
      y: {
        grid: { color: (c) => (c.tick.value === 0 ? t.zero : t.grid) },
        border: { display: false },
        ticks: { color: t.tick, callback: (v) => formatShort(Number(v)), maxTicksLimit: 6 },
      },
    },
  };
}

export function BalanceChart({
  summaries,
  selectedId,
  onSelect,
  baseline,
  height = 220,
}: {
  summaries: Summaries;
  selectedId: PeriodId;
  onSelect: (id: PeriodId) => void;
  baseline?: Map<PeriodId, number> | null;
  height?: number;
}) {
  const t = useChartTheme();
  const ps = summaries.periods;
  const lastClosed = ps.findIndex((p) => p.status === 'current') - 1;

  const data: ChartData<'line'> = {
    labels: ps.map((p) => periodShortName(p.id)),
    datasets: [
      ...(baseline
        ? [{
            label: 'Módosítás előtt',
            data: ps.map((p) => baseline.get(p.id) ?? null),
            borderColor: t.faint,
            borderWidth: 2,
            borderDash: [2, 3],
            pointRadius: 0,
            tension: 0.25,
          }]
        : []),
      {
        label: 'Tény',
        data: ps.map((p, i) => (i <= lastClosed ? p.endBalance : null)),
        borderColor: t.accent,
        backgroundColor: withAlpha(t.accent, 0.08),
        fill: 'origin',
        borderWidth: 2,
        pointRadius: ps.map((p) => (p.id === selectedId ? 6 : 3)),
        pointBackgroundColor: t.accent,
        pointBorderColor: t.surface,
        pointBorderWidth: 2,
        tension: 0.25,
      },
      {
        label: 'Előrejelzés',
        data: ps.map((p, i) => (i >= Math.max(0, lastClosed) ? p.endBalance : null)),
        borderColor: t.accent,
        borderDash: [6, 4],
        borderWidth: 2,
        pointRadius: ps.map((p, i) => (i <= lastClosed ? 0 : p.id === selectedId ? 6 : 3)),
        pointBackgroundColor: t.surface,
        pointBorderColor: t.accent,
        pointBorderWidth: 2,
        tension: 0.25,
      },
    ],
  };

  const base = baseOptions(t, (i) => onSelect(ps[i].id)) as ChartOptions<'line'>;
  const options: ChartOptions<'line'> = {
    ...base,
    plugins: {
      legend: { display: false },
      tooltip: {
        filter: (item) => item.raw !== null && !(item.dataset.label === 'Előrejelzés' && item.dataIndex <= lastClosed),
        callbacks: {
          title: (items) => periodName(ps[items[0].dataIndex].id, true),
          label: (c) => `${c.dataset.label}: ${formatFt(Number(c.raw))}`,
        },
      },
    },
  };

  return (
    <div>
      <div className="tiny muted" style={{ display: 'flex', gap: 16, marginBottom: 8, flexWrap: 'wrap' }}>
        <span className="cluster gap-1-5">
          <span style={{ width: 16, height: 2, background: t.accent }} /> Tény (hónap végén)
        </span>
        <span className="cluster gap-1-5">
          <span style={{ width: 16, borderTop: `2px dashed ${t.accent}` }} /> Előrejelzés a terv alapján
        </span>
        {baseline && (
          <span className="cluster gap-1-5">
            <span style={{ width: 16, borderTop: `2px dotted ${t.faint}` }} /> Módosítás előtt
          </span>
        )}
      </div>
      <div style={{ position: 'relative', height }}>
        <Line data={data} options={options} aria-label="Futó egyenleg hónaponként" role="img" />
      </div>
    </div>
  );
}

const MAX_UNITS = 8;

export function SpendingChart({
  summaries,
  categories,
  entries = [],
  selectedId,
  onSelect,
  height = 240,
}: {
  summaries: Summaries;
  categories: Category[];
  /** A megtakarításból fizetett költés (felhasználás „Mire ment?” kategóriával) halvány rétegként jelenik meg. */
  entries?: Entry[];
  selectedId: PeriodId;
  onSelect: (id: PeriodId) => void;
  height?: number;
}) {
  const t = useChartTheme();
  const ps = summaries.periods;
  const savings = useMemo(() => {
    const spend = savingsSpend(entries);
    return displayUnits(categories.filter(isExpense))
      .map((u) => ({ ...u, values: ps.map((p) => u.categories.reduce((s, c) => s + (spend.get(c.id)?.get(p.id) ?? 0), 0)) }))
      .filter((u) => u.values.some((v) => v > 0));
  }, [entries, categories, ps]);

  const series = useMemo(() => {
    const units = displayUnits(categories.filter(isExpense));
    const rows = units.map((u) => ({
      ...u,
      values: ps.map((p) => u.categories.reduce((s, c) => s + (p.byCategory.get(c.id)?.counted ?? 0), 0)),
    }));
    const withData = rows.filter((r) => r.values.some((v) => v > 0));
    if (withData.length <= MAX_UNITS) return withData;
    const total = (r: (typeof rows)[number]) => r.values.reduce((a, b) => a + b, 0);
    const keep = new Set([...withData].sort((a, b) => total(b) - total(a)).slice(0, MAX_UNITS - 1).map((r) => r.key));
    const rest = withData.filter((r) => !keep.has(r.key));
    return [
      ...withData.filter((r) => keep.has(r.key)),
      {
        key: 'rest', name: 'Többi', color: '#888780', icon: 'dots', categories: [],
        values: ps.map((_, i) => rest.reduce((s, r) => s + r.values[i], 0)),
      },
    ];
  }, [categories, ps]);

  const alpha = (hex: string, i: number) => {
    const p = ps[i];
    if (p.id === selectedId) return hex;
    return p.status === 'future' ? withAlpha(hex, 0.35) : withAlpha(hex, 0.7);
  };

  const data: ChartData<'bar'> = {
    labels: ps.map((p) => periodShortName(p.id)),
    datasets: series.map((s) => ({
      label: s.name,
      data: s.values,
      backgroundColor: ps.map((_, i) => alpha(s.color, i)),
      borderColor: t.surface,
      borderWidth: { top: 2, bottom: 0, left: 0, right: 0 },
      borderSkipped: false,
      maxBarThickness: 34,
      borderRadius: 2,
    })),
  };
  data.datasets.push(
    ...savings.map((s) => ({
      label: `${s.name} (megtakarításból)`,
      data: s.values,
      backgroundColor: withAlpha(s.color, 0.25),
      borderColor: s.color,
      borderWidth: 1,
      borderDash: [3, 2],
      borderSkipped: false as const,
      maxBarThickness: 34,
      borderRadius: 2,
    })),
  );

  const base = baseOptions(t, (i) => onSelect(ps[i].id)) as ChartOptions<'bar'>;
  const options: ChartOptions<'bar'> = {
    ...base,
    plugins: {
      legend: { display: false },
      tooltip: {
        itemSort: (a, b) => b.datasetIndex - a.datasetIndex,
        filter: (item) => Number(item.raw) > 0,
        callbacks: {
          title: (items) => {
            const p = ps[items[0].dataIndex];
            return `${periodName(p.id, true)} · ${formatFt(p.expense)}${p.status === 'future' ? ' (várható)' : ''}`;
          },
          label: (c) => `${c.dataset.label}: ${formatFt(Number(c.raw))}`,
        },
      },
    },
    scales: {
      x: { ...base.scales!.x, stacked: true },
      y: { ...base.scales!.y, stacked: true },
    },
  };

  return (
    <div>
      <div className="tiny muted" style={{ display: 'flex', gap: '6px 14px', marginBottom: 8, flexWrap: 'wrap' }}>
        {series.map((s) => (
          <span className="cluster gap-1-5" key={s.key}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: s.color }} />
            {s.name}
          </span>
        ))}
        {savings.length > 0 && (
          <span className="cluster gap-1-5">
            <span style={{ width: 10, height: 10, borderRadius: 2, background: withAlpha(t.tick, 0.25), border: `1px dashed ${t.tick}` }} />
            halvány: megtakarításból
          </span>
        )}
      </div>
      <div style={{ position: 'relative', height }}>
        <BarChart data={data} options={options} aria-label="Kiadások kategóriánként, hónaponként" role="img" />
      </div>
    </div>
  );
}

/** Egy kategória (csoport) trendje: tény vonalként, terv lépcsőként, 3 havi átlag szaggatottan. */
export function TrendChart({ points, refId, height = 220 }: { points: TrendPoint[]; refId: PeriodId; height?: number }) {
  const t = useChartTheme();
  const withSavings = points.some((p) => p.fromSavings > 0);
  const data: ChartData<'line'> = {
    labels: points.map((p) => periodShortLabel(p.periodId, refId)),
    datasets: [
      {
        label: 'Terv',
        data: points.map((p) => p.plan),
        borderColor: t.faint,
        borderWidth: 2,
        stepped: 'middle',
        pointRadius: 0,
      },
      {
        label: '3 havi átlag',
        data: points.map((p) => p.avg3),
        borderColor: t.tick,
        borderWidth: 1.5,
        borderDash: [5, 4],
        pointRadius: 0,
        tension: 0.25,
      },
      ...(withSavings
        ? [{
            label: 'Megtakarításból együtt',
            data: points.map((p) => p.actual + p.fromSavings),
            borderColor: withAlpha(t.accent, 0.5),
            borderWidth: 2,
            borderDash: [2, 3],
            pointRadius: 0,
            tension: 0.25,
          }]
        : []),
      {
        label: 'Tény',
        data: points.map((p) => p.actual),
        borderColor: t.accent,
        backgroundColor: withAlpha(t.accent, 0.08),
        fill: 'origin',
        borderWidth: 2.5,
        pointRadius: points.map((p) => (p.current ? 5 : 3)),
        pointBackgroundColor: points.map((p) => (p.current ? t.surface : t.accent)),
        pointBorderColor: points.map((p) => (p.current ? t.accent : t.surface)),
        pointBorderWidth: 2,
        tension: 0.25,
      },
    ],
  };
  const base = baseOptions(t, () => {}) as ChartOptions<'line'>;
  const options: ChartOptions<'line'> = {
    ...base,
    onHover: undefined,
    plugins: {
      legend: { display: false },
      tooltip: {
        itemSort: (a, b) => b.datasetIndex - a.datasetIndex,
        filter: (item) => item.raw !== null,
        callbacks: {
          title: (items) => {
            const p = points[items[0].dataIndex];
            return `${periodName(p.periodId, true)}${p.current ? ' (eddig)' : ''}`;
          },
          label: (c) => `${c.dataset.label}: ${formatFt(Number(c.raw))}`,
        },
      },
    },
    scales: { ...base.scales, y: { ...base.scales!.y, beginAtZero: true } },
  };
  return (
    <div>
      <div className="tiny muted" style={{ display: 'flex', gap: '6px 16px', marginBottom: 8, flexWrap: 'wrap' }}>
        <span className="cluster gap-1-5">
          <span style={{ width: 16, height: 2, background: t.accent }} /> Tény
        </span>
        <span className="cluster gap-1-5">
          <span style={{ width: 16, height: 2, background: t.faint }} /> Terv
        </span>
        <span className="cluster gap-1-5">
          <span style={{ width: 16, borderTop: `2px dashed ${t.tick}` }} /> 3 havi átlag
        </span>
        {withSavings && (
          <span className="cluster gap-1-5">
            <span style={{ width: 16, borderTop: `2px dotted ${t.accent}` }} /> Megtakarításból együtt
          </span>
        )}
      </div>
      <div style={{ position: 'relative', height }}>
        <Line data={data} options={options} aria-label="Kiadás hónaponként a tervvel és az átlaggal" role="img" />
      </div>
    </div>
  );
}
