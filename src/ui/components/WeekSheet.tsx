import { useMemo } from 'react';
import { formatFt } from '../../domain/money';
import { shortDate } from '../../domain/periods';
import type { ISODate } from '../../domain/types';
import { avgName, weekdayName, weekEntries, weekRelative, weekSummary, weekTitle } from '../../domain/weekly';
import { useBudget } from '../context';
import { Icon } from './common';
import { Sheet } from './Sheet';

// A lap neve a router memóriabeli rétegében: „week|<hétfő>|<kategóriaId>”.
const PREFIX = 'week|';
export const weekSheetName = (start: ISODate, categoryId: string) => `${PREFIX}${start}|${categoryId}`;
export function parseWeekSheet(name: string | null): { start: ISODate; categoryId: string } | null {
  if (!name?.startsWith(PREFIX)) return null;
  const rest = name.slice(PREFIX.length);
  const i = rest.indexOf('|');
  return i < 0 ? null : { start: rest.slice(0, i), categoryId: rest.slice(i + 1) };
}

/** A heti nézet sorának azonosítója: a lap bezárásakor ide kerül vissza a fókusz, ha a megnyitó elem már nincs meg. */
export const weekRowSelector = (categoryId: string) => `[data-week-row="${CSS.escape(categoryId)}"]`;

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Egy kategória a héten: az összeg, a mérce, a havi keret maradéka és a hét rögzítései. */
export function WeekSheet({ start, categoryId, onClose }: { start: ISODate; categoryId: string; onClose: () => void }) {
  const { data, summaries, cfg, today, openTrend } = useBudget();
  const w = useMemo(() => weekSummary(data, summaries, cfg, start, today), [data, summaries, cfg, start, today]);
  const list = useMemo(() => weekEntries(data.entries, categoryId, w.start), [data.entries, categoryId, w.start]);
  const cat = data.categories.find((c) => c.id === categoryId);
  const row = w.rows.find((r) => r.cat.id === categoryId) ?? w.quiet.find((r) => r.cat.id === categoryId);

  return (
    <Sheet title={cat?.name ?? 'Kategória'} onClose={onClose} fallbackFocus={() => document.querySelector<HTMLElement>(weekRowSelector(categoryId))}>
      {!cat ? (
        <p className="small muted">Ez a kategória már nem található.</p>
      ) : (
        <div className="trend">
          <p className="small muted m-0 num">
            {weekTitle(w.start, today)}, {weekRelative(w.start, today)}
          </p>
          <dl className="sumlist">
            <dt>{w.current ? 'Ezen a héten eddig' : 'A héten'}</dt>
            <dd className="num week-sheet-amount">{formatFt(row?.amount ?? 0)}</dd>
            {!!row?.fromSavings && (
              <>
                <dt>Megtakarításból fizetve</dt>
                <dd className="num">{formatFt(row.fromSavings)}</dd>
              </>
            )}
            {row && row.avg !== null && (
              <>
                <dt>{capital(avgName(row.avgWeeks))}</dt>
                <dd className="num">{formatFt(row.avg)}</dd>
              </>
            )}
            {row && row.left !== null && (
              <>
                <dt>{row.left >= 0 ? 'A havi keretből maradt' : 'A havi keret túllépése'}</dt>
                <dd className="num">{formatFt(Math.abs(row.left))}</dd>
              </>
            )}
          </dl>
          <div>
            <h3 className="week-sheet-h">A hét rögzítései</h3>
            {list.length === 0 ? (
              <p className="small muted m-0">Erre a hétre nincs rögzítés.</p>
            ) : (
              <ul className="week-entries">
                {list.map((e) => (
                  <li key={e.id} className="week-entry">
                    <span className="week-entry-main">
                      <span className={e.note ? 'week-entry-note' : 'muted'}>{e.note ?? 'megjegyzés nélkül'}</span>
                      <span className="tiny faint">
                        {weekdayName(e.date)}, {shortDate(e.date)}
                        {e.createdBy && ` · ${e.createdBy}`}
                        {e.kind === 'withdrawal' && ' · megtakarításból'}
                      </span>
                    </span>
                    <span className="small num week-entry-amount">{formatFt(e.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button className="btn week-sheet-trend" onClick={() => openTrend(`c:${cat.id}`)}>
            <Icon name="chart-line" /> Havi trend megnyitása
          </button>
        </div>
      )}
    </Sheet>
  );
}
