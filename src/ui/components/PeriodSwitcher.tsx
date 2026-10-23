import { formatRange, periodName } from '../../domain/periods';
import { useBudget } from '../context';
import { Icon } from './common';

const STATUS_LABEL = { closed: 'Lezárt', current: 'Folyamatban', future: 'Jövőbeli' } as const;

export function PeriodSwitcher() {
  const { summaries, periodId, setPeriodId } = useBudget();
  const list = summaries.periods;
  const i = list.findIndex((p) => p.id === periodId);
  const p = list[i];
  const thisYear = summaries.currentId.slice(0, 4);

  return (
    <div className="period-switch">
      <button className="btn icon" aria-label="Előző hónap" disabled={i <= 0} onClick={() => setPeriodId(list[i - 1].id)}>
        <Icon name="chevron-left" />
      </button>
      <select aria-label="Hónap" value={periodId} onChange={(e) => setPeriodId(e.target.value)}>
        {list.map((x) => (
          <option key={x.id} value={x.id}>
            {periodName(x.id, x.id.slice(0, 4) !== thisYear)}
            {x.status === 'current' ? ' •' : ''}
          </option>
        ))}
      </select>
      <button className="btn icon" aria-label="Következő hónap" disabled={i >= list.length - 1} onClick={() => setPeriodId(list[i + 1].id)}>
        <Icon name="chevron-right" />
      </button>
      {p && (
        <span className="small muted num" style={{ marginLeft: 4 }}>
          {formatRange(p.start, p.end)}
        </span>
      )}
      {p && <span className={`period-badge ${p.status === 'current' ? 'current' : ''}`}>{STATUS_LABEL[p.status]}</span>}
      {p && p.status !== 'current' && (
        <button className="btn sm ghost" onClick={() => setPeriodId(summaries.currentId)}>
          Ugrás a mostanira
        </button>
      )}
    </div>
  );
}
