import { useEffect, useMemo, useRef } from 'react';
import type { PeriodSummary } from '../../domain/balance';
import { coverSources, needsCover } from '../../domain/flex';
import type { GoalProgress } from '../../domain/goals';
import type { PaceOverview } from '../../domain/pace';
import { clampToPeriod } from '../../domain/periods';
import { settleLabel } from '../../domain/status';
import { buildTodos, MAX_TODOS, todoText, type Todo } from '../../domain/todos';
import type { Category } from '../../domain/types';
import { useSettleRest } from '../actions';
import { backupIsStale, daysSince, exportBackup } from '../backup';
import { useBudget, useSafe } from '../context';
import { Icon, SettleButton } from './common';

const todoKey = (t: Todo) => {
  switch (t.kind) {
    case 'bill':
    case 'income':
    case 'goal':
      return `${t.kind}:${t.cat.id}`;
    case 'envelope':
      return `envelope:${t.env.cat.id}`;
    default:
      return t.kind;
  }
};

/** Ikon és szín a teendő súlya szerint: lejárt és túllépett piros, a figyelmeztetések borostyán. */
function todoIcon(t: Todo): { name: string; tone: 'bad' | 'warn' | 'info' } {
  switch (t.kind) {
    case 'bill':
      return t.overdue ? { name: 'alert-circle', tone: 'bad' } : { name: 'calendar-due', tone: 'warn' };
    case 'income':
      return { name: 'cash', tone: 'warn' };
    case 'envelope':
      return t.env.pace === 'over' ? { name: 'alert-triangle', tone: 'bad' } : { name: 'trending-up', tone: 'warn' };
    case 'goal':
      return { name: 'target-arrow', tone: 'warn' };
    case 'idle':
      return { name: 'pencil-plus', tone: 'info' };
    case 'backup':
      return { name: 'cloud-download', tone: 'warn' };
  }
}

/**
 * Teendők sáv az Áttekintésen, a folyamatban lévő időszakban: legfeljebb 5 elem, mindegyik egy művelettel.
 * A „Kifizetve” / „Megérkezett” ugyanazzal a lezárással és visszavonással rögzít, mint a Rögzítés.
 */
export function Todos({ p, pace, goals }: { p: PeriodSummary; pace: PaceOverview; goals: { cat: Category; g: GoalProgress }[] }) {
  const { data, today, cfg, go, openQuick, openCover } = useBudget();
  const safe = useSafe();
  const settleRest = useSettleRest();
  const stale = backupIsStale(data);
  const backupDays = daysSince(data.settings.lastExportAt);
  const todos = useMemo(
    () =>
      buildTodos({
        categories: data.categories,
        entries: data.entries,
        period: p,
        pace,
        today,
        goals,
        createdAt: data.settings.createdAt,
        backup: { stale, days: backupDays },
      }),
    [data.categories, data.entries, data.settings.createdAt, p, pace, today, goals, stale, backupDays],
  );

  // A lezárt teendő eltűnik, vele a fókuszban lévő gomb is: a fókusz a helyére lépő teendő gombjára kerül,
  // ha nincs ilyen, a címre vagy a „Minden rendben” sorra, hogy billentyűzettel ne az oldal tetejéről kelljen
  // újrakezdeni.
  const pendingFocus = useRef<{ key: string; index: number } | null>(null);
  useEffect(() => {
    const pf = pendingFocus.current;
    if (!pf || todos.slice(0, MAX_TODOS).some((t) => todoKey(t) === pf.key)) return;
    pendingFocus.current = null;
    // Ha a felhasználó közben máshová lépett, nem rántjuk el a fókuszt.
    if (document.activeElement && document.activeElement !== document.body) return;
    const items = document.querySelectorAll<HTMLElement>('#todo-list > li');
    const next = items[Math.min(pf.index, items.length - 1)]?.querySelector<HTMLElement>('button:not(:disabled)');
    (next ?? document.getElementById('todos-title') ?? document.getElementById('todos-ok'))?.focus();
  }, [todos]);

  if (todos.length === 0) {
    return (
      <div id="todos-ok" className="card todos todos-ok" tabIndex={-1}>
        <Icon name="circle-check" /> Minden rendben
      </div>
    );
  }

  const shown = todos.slice(0, MAX_TODOS);
  const date = clampToPeriod(today, p.id, cfg);

  const action = (t: Todo, index: number) => {
    switch (t.kind) {
      case 'bill':
      case 'income': {
        const label = settleLabel(t.cat.type, t.partial);
        return (
          <SettleButton
            label={label}
            ariaLabel={`${t.cat.name}: ${label.toLowerCase()}`}
            onClick={async () => {
              pendingFocus.current = { key: todoKey(t), index };
              const ok = await safe(async () => {
                await settleRest(p.id, t.cat, t.amount, date, t.partial);
                return true;
              });
              if (!ok) pendingFocus.current = null;
            }}
          />
        );
      }
      case 'envelope': {
        // Fedezet csak akkor, ha van keret, amelyben maradt pénz; különben üres lap nyílna.
        const cover = needsCover(t.env, pace) && coverSources(pace, t.env.cat.id).length > 0;
        return (
          <span className="todo-actions">
            {cover && (
              <button
                className="sm"
                aria-label={`${t.env.cat.name}: fedezet áthozása másik keretből`}
                onClick={() => {
                  // Ha a fedezettel a teendő megszűnik, a fókusz a helyére lépőre kerül (mint a lezárásnál).
                  pendingFocus.current = { key: todoKey(t), index };
                  openCover(t.env.cat.id);
                }}
              >
                <Icon name="arrows-exchange" /> Fedezet áthozása
              </button>
            )}
            <button className="sm" aria-label={`${t.env.cat.name} megnyitása a Rögzítésben`} onClick={() => go('record', t.env.cat.id)}>
              Megnyitás <Icon name="chevron-right" />
            </button>
          </span>
        );
      }
      case 'goal':
        return (
          <button className="sm" aria-label={`${t.cat.name}: havi terv a Tervezőben`} onClick={() => go('planner')}>
            Tervező <Icon name="chevron-right" />
          </button>
        );
      case 'idle':
        return (
          <button className="sm" onClick={openQuick}>
            <Icon name="plus" /> Rögzítés
          </button>
        );
      case 'backup':
        return (
          <button className="sm" onClick={() => safe(() => exportBackup(data))}>
            <Icon name="download" /> Mentés
          </button>
        );
    }
  };

  return (
    <section className="card todos" aria-labelledby="todos-title">
      <h2 id="todos-title" className="todos-title" tabIndex={-1}>Teendők</h2>
      <ul id="todo-list" className="todo-list">
        {shown.map((t, i) => {
          const icon = todoIcon(t);
          return (
            <li key={todoKey(t)} className="todo">
              <Icon name={icon.name} className={`todo-icon ${icon.tone}`} />
              <span className="todo-text small num">{todoText(t, today)}</span>
              {action(t, i)}
            </li>
          );
        })}
      </ul>
      {todos.length > shown.length && <p className="tiny faint todo-more">és még {todos.length - shown.length} teendő</p>}
    </section>
  );
}
