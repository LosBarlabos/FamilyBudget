import { goalSummary, type GoalProgress, type GoalState } from '../../domain/goals';
import { formatFt } from '../../domain/money';
import type { Category } from '../../domain/types';
import { Bar, CatIcon } from './common';

const STATE: Record<Exclude<GoalState, 'noTarget'>, { label: string; cls: string }> = {
  reached: { label: 'Elérve', cls: 'ok' },
  onTrack: { label: 'Időben', cls: 'ok' },
  behind: { label: 'Lemarad', cls: 'bad' },
  noPlan: { label: 'Nincs havi terv', cls: 'warn' },
};

export function GoalStateChip({ state }: { state: GoalState }) {
  if (state === 'noTarget') return null;
  const s = STATE[state];
  return <span className={`chip ${s.cls}`}>{s.label}</span>;
}

export function GoalRow({ cat, g, onClick }: { cat: Category; g: GoalProgress; onClick?: () => void }) {
  return (
    <div
      className="goal-row"
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => onClick && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onClick())}
    >
      <CatIcon cat={cat} />
      <div className="goal-main">
        <div className="goal-head">
          <span className="rec-name">
            {cat.name} <GoalStateChip state={g.state} />
          </span>
          <span className="num small">
            <span style={{ fontWeight: 600 }}>{formatFt(g.saved)}</span>
            {g.target !== null && <span className="faint"> / {formatFt(g.target)} · {g.pct}%</span>}
          </span>
        </div>
        {g.target !== null && (
          <div style={{ margin: '6px 0 4px' }}>
            <Bar value={g.saved} max={g.target} tone={g.state === 'reached' ? 'good' : undefined} color={g.state === 'reached' ? undefined : cat.color} />
          </div>
        )}
        <div className="tiny muted num">{goalSummary(g)}</div>
      </div>
    </div>
  );
}
