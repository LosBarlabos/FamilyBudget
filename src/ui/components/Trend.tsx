import { useMemo } from 'react';
import { rangePeriods, savingsSpend, trendSeries, type AnalysisRange } from '../../domain/analysis';
import { formatFt } from '../../domain/money';
import { periodName } from '../../domain/periods';
import { isExpense } from '../../domain/types';
import { useBudget } from '../context';
import { TrendChart } from './Charts';
import { useLocalState } from './common';
import { Sheet } from './Sheet';

// A lap neve a router memóriabeli rétegében: „trend|c:<kategóriaId>” vagy „trend|g:<csoport>”.
const PREFIX = 'trend|';
export const trendSheetName = (key: string) => `${PREFIX}${key}`;
export const parseTrendSheet = (name: string | null) => (name?.startsWith(PREFIX) ? name.slice(PREFIX.length) : null);

/**
 * Egy kategória vagy csoport trendje az Elemzésből: a választott időablakban, „Ez az időszak” módban az utolsó
 * 12 időszakban, hogy legyen mihez mérni.
 */
export function TrendSheet({ unitKey, onClose }: { unitKey: string; onClose: () => void }) {
  const { data, summaries, periodId } = useBudget();
  const [range] = useLocalState<AnalysisRange>('analysis-range', 'period');
  const group = unitKey.startsWith('g:') ? unitKey.slice(2) : null;
  const cats = data.categories.filter((c) => isExpense(c) && (group ? c.group === group : c.id === unitKey.slice(2)));
  const name = group ?? cats[0]?.name ?? 'Kategória';
  const periods = rangePeriods(summaries, periodId, range === 'period' ? 'last12' : range);
  const ids = cats.map((c) => c.id);
  const spend = useMemo(() => savingsSpend(data.entries), [data.entries]);
  const points = trendSeries(ids, periods, spend);

  const closed = points.filter((p) => !p.current);
  const avg = closed.length ? Math.round(closed.reduce((s, p) => s + p.actual, 0) / closed.length) : null;
  const max = closed.reduce<(typeof closed)[number] | null>((m, p) => (!m || p.actual > m.actual ? p : m), null);
  const cur = points.find((p) => p.current);
  const lastPlan = points.at(-1)?.plan ?? 0;

  return (
    <Sheet title={name} onClose={onClose}>
      {cats.length === 0 ? (
        <p className="small muted">Ez a kategória már nem található.</p>
      ) : (
        <div className="trend">
          <TrendChart points={points} refId={points.at(-1)?.periodId ?? periodId} />
          <dl className="sumlist">
            {avg !== null && (
              <>
                <dt>Átlag ({closed.length} lezárt hónap)</dt>
                <dd className="num">{formatFt(avg)}</dd>
              </>
            )}
            {max && closed.length > 1 && (
              <>
                <dt>Legtöbb ({periodName(max.periodId).toLowerCase()})</dt>
                <dd className="num">{formatFt(max.actual)}</dd>
              </>
            )}
            {cur && (
              <>
                <dt>{periodName(cur.periodId)}, eddig</dt>
                <dd className="num">{formatFt(cur.actual)}</dd>
              </>
            )}
            <dt className="total">Jelenlegi terv</dt>
            <dd className="total num">{lastPlan ? formatFt(lastPlan) : 'nincs'}</dd>
          </dl>
          {closed.length < 2 && (
            <p className="tiny faint m-0">A trend néhány lezárt hónap után lesz beszédes.</p>
          )}
        </div>
      )}
    </Sheet>
  );
}
