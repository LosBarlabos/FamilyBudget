import { useEffect, useMemo, useRef, useState } from 'react';
import type { PeriodSummary } from '../../domain/balance';
import { coverSources, needsCover } from '../../domain/flex';
import type { GoalProgress } from '../../domain/goals';
import type { PaceOverview } from '../../domain/pace';
import { clampToPeriod } from '../../domain/periods';
import { settleLabel } from '../../domain/status';
import {
  buildTodos, groupSettleMessage, groupText, groupTodos, MAX_TODOS, todoText, type Todo, type TodoGroup, type TodoItem,
} from '../../domain/todos';
import type { Category } from '../../domain/types';
import { useSettleAll, useSettleRest } from '../actions';
import { backupIsStale, daysSince, exportBackup } from '../backup';
import { useBudget, useSafe } from '../context';
import { useSyncConfig } from '../../sync/engine';
import { Badge, Icon, SettleButton } from './common';

const todoKey = (t: TodoItem) => {
  switch (t.kind) {
    case 'group':
      return `group:${t.of}`;
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
function todoIcon(t: TodoItem): { name: string; tone: 'bad' | 'warn' | 'info' } {
  switch (t.kind) {
    case 'group':
      if (t.of === 'income') return { name: 'cash', tone: 'warn' };
      return t.items.some((b) => b.overdue) ? { name: 'receipt', tone: 'bad' } : { name: 'calendar-due', tone: 'warn' };
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
  // Közös használatnál a GitHub az előzményekkel együtt tárolja az adatokat, külön mentés nem kell.
  const stale = !useSyncConfig() && backupIsStale(data);
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
  const items = useMemo(() => groupTodos(todos), [todos]);
  const settleAll = useSettleAll();
  // A kinyitott csoportok („Egyenként”): a csoport kulcsa szerint.
  const [expanded, setExpanded] = useState<string[]>([]);

  // A lezárt teendő eltűnik, vele a fókuszban lévő gomb is: a fókusz a helyére lépő teendő gombjára kerül,
  // ha nincs ilyen, a címre vagy a „Minden rendben” sorra, hogy billentyűzettel ne az oldal tetejéről kelljen
  // újrakezdeni.
  const pendingFocus = useRef<{ key: string; index: number } | null>(null);
  useEffect(() => {
    const pf = pendingFocus.current;
    if (!pf || items.slice(0, MAX_TODOS).some((t) => todoKey(t) === pf.key)) return;
    pendingFocus.current = null;
    // Ha a felhasználó közben máshová lépett, nem rántjuk el a fókuszt.
    if (document.activeElement && document.activeElement !== document.body) return;
    const rows = document.querySelectorAll<HTMLElement>('#todo-list > li');
    const next = rows[Math.min(pf.index, rows.length - 1)]?.querySelector<HTMLElement>('button:not(:disabled)');
    (next ?? document.getElementById('todos-title') ?? document.getElementById('todos-ok'))?.focus();
  }, [items]);

  if (todos.length === 0) {
    return (
      <div id="todos-ok" className="card todos todos-ok" tabIndex={-1}>
        <Icon name="circle-check" /> Minden rendben
      </div>
    );
  }

  const shown = items.slice(0, MAX_TODOS);
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
                className="btn sm"
                aria-label={`${t.env.cat.name}: átcsoportosítás másik keretből`}
                onClick={() => {
                  // Ha a fedezettel a teendő megszűnik, a fókusz a helyére lépőre kerül (mint a lezárásnál).
                  pendingFocus.current = { key: todoKey(t), index };
                  openCover(t.env.cat.id);
                }}
              >
                <Icon name="arrows-exchange" /> Átcsoportosítás
              </button>
            )}
            <button className="btn sm" aria-label={`${t.env.cat.name} megnyitása a Rögzítésben`} onClick={() => go('record', t.env.cat.id)}>
              Megnyitás <Icon name="chevron-right" />
            </button>
          </span>
        );
      }
      case 'goal':
        return (
          <button className="btn sm" aria-label={`${t.cat.name}: havi terv a Tervezőben`} onClick={() => go('planner')}>
            Tervező <Icon name="chevron-right" />
          </button>
        );
      case 'idle':
        return (
          <button className="btn sm" onClick={openQuick}>
            <Icon name="plus" /> Rögzítés
          </button>
        );
      case 'backup':
        return (
          <button className="btn sm" onClick={() => safe(() => exportBackup(data))}>
            <Icon name="download" /> Mentés letöltése
          </button>
        );
    }
  };

  const groupAction = (g: TodoGroup, index: number) => {
    const key = todoKey(g);
    const open = expanded.includes(key);
    return (
      <span className="todo-actions">
        <button
          className="btn sm"
          aria-expanded={open}
          aria-controls={`todo-sub-${g.of}`}
          onClick={() => setExpanded(open ? expanded.filter((k) => k !== key) : [...expanded, key])}
        >
          {open ? 'Becsuk' : 'Egyenként'}
        </button>
        <SettleButton
          primary
          label={g.of === 'bill' ? 'Mind kifizetve' : 'Mind megjött'}
          ariaLabel={`${groupText(g).title}: ${g.of === 'bill' ? 'mind kifizetve' : 'mind megérkezett'}`}
          onClick={async () => {
            pendingFocus.current = { key, index };
            const ok = await safe(async () => {
              await settleAll(p.id, g.items, date, groupSettleMessage(g));
              return true;
            });
            if (!ok) pendingFocus.current = null;
          }}
        />
      </span>
    );
  };

  const row = (t: TodoItem, i: number) => {
    const icon = todoIcon(t);
    const { title, sub } = t.kind === 'group' ? groupText(t) : splitText(todoText(t, today));
    const open = t.kind === 'group' && expanded.includes(todoKey(t));
    return (
      <li key={todoKey(t)} className="todo">
        <span className={`tile tile-lg todo-icon ${icon.tone}`}>
          <Icon name={icon.name} />
        </span>
        <span className="todo-text num">
          <span className="todo-title">{title}</span>
          {sub && <span className="todo-sub">{sub}</span>}
        </span>
        {t.kind === 'group' ? groupAction(t, i) : action(t, i)}
        {open && (
          <ul id={`todo-sub-${t.of}`} className="todo-list todo-sublist">
            {t.items.map((it) => row(it, i))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <section className="card todos" aria-labelledby="todos-title">
      <div className="todos-head">
        <h2 id="todos-title" className="todos-title" tabIndex={-1}>Teendők</h2>
        <Badge tone="strong" className="num" aria-hidden>{items.length}</Badge>
      </div>
      <ul id="todo-list" className="todo-list">
        {shown.map(row)}
      </ul>
      {items.length > shown.length && <p className="tiny faint todo-more">és még {items.length - shown.length} teendő</p>}
    </section>
  );
}

/** „Áram · lejárt okt. 15. · 18 000 Ft” → cím („Áram”) és alsor; elválasztó nélkül csak cím. */
function splitText(text: string): { title: string; sub: string } {
  const m = /( · |: )/.exec(text);
  if (!m) return { title: text, sub: '' };
  return { title: text.slice(0, m.index), sub: text.slice(m.index + m[0].length) };
}
