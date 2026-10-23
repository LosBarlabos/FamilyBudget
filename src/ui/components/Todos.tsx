import { useEffect, useMemo, useRef } from 'react';
import type { PeriodSummary } from '../../domain/balance';
import { coverSources, needsCover } from '../../domain/flex';
import type { GoalProgress } from '../../domain/goals';
import type { PaceOverview } from '../../domain/pace';
import { clampToPeriod } from '../../domain/periods';
import { settleLabel } from '../../domain/status';
import { formatFt, formatSigned } from '../../domain/money';
import {
  billWhenText, buildTodos, groupSettleMessage, groupTodos, MAX_TODOS, todoText, type BillTodo, type IncomeTodo, type Todo,
} from '../../domain/todos';
import type { Category } from '../../domain/types';
import { useSettleAll, useSettleRest } from '../actions';
import { backupIsStale, daysSince, exportBackup } from '../backup';
import { useBudget, useSafe } from '../context';
import { useSyncConfig } from '../../sync/engine';
import { Badge, Icon, SettleButton } from './common';

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

/** Ikon és szín a teendő súlya szerint: túllépett piros, a figyelmeztetések borostyán. */
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

type MoneyTodo = BillTodo | IncomeTodo;
const isMoney = (t: Todo): t is MoneyTodo => t.kind === 'bill' || t.kind === 'income';

/**
 * Az Áttekintés jobb oszlopa a folyamatban lévő időszakban. Fent a „Fizetendő és várható”: az esedékes számlák
 * csekkként (a lejárt csekksárga) és a még meg nem érkezett bevételek, mindegyik a saját gombjával. Alatta a
 * többi teendő (legfeljebb 5), mindegyik egy művelettel. A „Kifizetve” / „Megérkezett” ugyanazzal a lezárással
 * és visszavonással rögzít, mint a Rögzítés.
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
  const money = useMemo(() => todos.filter(isMoney), [todos]);
  const rest = useMemo(() => todos.filter((t) => !isMoney(t)), [todos]);
  const billGroup = useMemo(() => groupTodos(money).find((t) => t.kind === 'group' && t.of === 'bill'), [money]);
  const settleAll = useSettleAll();

  // A lezárt sor eltűnik, vele a fókuszban lévő gomb is: a fókusz a helyére lépő sor gombjára kerül, ha nincs
  // ilyen, a szakasz címére vagy a „Minden rendben” sorra, hogy billentyűzettel ne az oldal tetejéről kelljen
  // újrakezdeni.
  const pendingFocus = useRef<{ key: string; index: number; list: 'bill-list' | 'todo-list' } | null>(null);
  useEffect(() => {
    const pf = pendingFocus.current;
    const keys = [...money, ...rest.slice(0, MAX_TODOS)].map(todoKey);
    if (!pf || keys.includes(pf.key)) return;
    pendingFocus.current = null;
    // Ha a felhasználó közben máshová lépett, nem rántjuk el a fókuszt.
    if (document.activeElement && document.activeElement !== document.body) return;
    const rows = document.querySelectorAll<HTMLElement>(`#${pf.list} > li`);
    const next = rows[Math.min(pf.index, rows.length - 1)]?.querySelector<HTMLElement>('button:not(:disabled)');
    const title = pf.list === 'bill-list' ? 'bills-title' : 'todos-title';
    (next ?? document.getElementById(title) ?? document.getElementById('todos-title') ?? document.getElementById('todos-ok'))?.focus();
  }, [money, rest]);

  if (todos.length === 0) {
    return (
      <div id="todos-ok" className="card todos todos-ok" tabIndex={-1}>
        <Icon name="circle-check" /> Minden rendben
      </div>
    );
  }

  const shown = rest.slice(0, MAX_TODOS);
  const date = clampToPeriod(today, p.id, cfg);

  const settle = (t: MoneyTodo, index: number) => async () => {
    pendingFocus.current = { key: todoKey(t), index, list: 'bill-list' };
    const ok = await safe(async () => {
      await settleRest(p.id, t.cat, t.amount, date, t.partial);
      return true;
    });
    if (!ok) pendingFocus.current = null;
  };

  const action = (t: Todo, index: number) => {
    switch (t.kind) {
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
                  pendingFocus.current = { key: todoKey(t), index, list: 'todo-list' };
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
      default:
        return null;
    }
  };

  const row = (t: Todo, i: number) => {
    const icon = todoIcon(t);
    const { title, sub } = splitText(todoText(t, today));
    return (
      <li key={todoKey(t)} className="todo">
        <span className={`tile tile-lg todo-icon ${icon.tone}`}>
          <Icon name={icon.name} />
        </span>
        <span className="todo-text num">
          <span className="todo-title">{title}</span>
          {sub && <span className="todo-sub">{sub}</span>}
        </span>
        {action(t, i)}
      </li>
    );
  };

  const bill = (t: MoneyTodo, i: number) => {
    const label = settleLabel(t.cat.type, t.partial);
    const income = t.kind === 'income';
    const state = income ? 'income' : t.overdue ? 'overdue' : 'due';
    const when = income ? (t.partial ? 'még nem érkezett meg teljesen' : 'még nem érkezett meg') : billWhenText(t, today);
    return (
      <li key={todoKey(t)} className={`bill ${state}`}>
        <span className="bill-text">
          <span className="bill-name">{t.cat.name}</span>
          <span className="bill-when">{t.partial && !income ? `${when}, hátralék` : when}</span>
        </span>
        <span className={`bill-amount num ${income ? 'pos' : ''}`}>{income ? formatSigned(t.amount) : formatFt(t.amount)}</span>
        <SettleButton label={label} ariaLabel={`${t.cat.name}: ${label.toLowerCase()}`} onClick={settle(t, i)} />
      </li>
    );
  };

  return (
    <div className="dash-side">
      {money.length > 0 && (
        <section className="bills" aria-labelledby="bills-title">
          <div className="bills-head">
            <h2 id="bills-title" tabIndex={-1}>{money.some((t) => t.kind === 'bill') ? 'Fizetendő és várható' : 'Várt bevétel'}</h2>
            {billGroup?.kind === 'group' && (
              <SettleButton
                primary
                label="Mind kifizetve"
                ariaLabel={`${billGroup.items.length} számla: mind kifizetve`}
                onClick={async () => {
                  pendingFocus.current = { key: todoKey(billGroup.items[0]), index: 0, list: 'bill-list' };
                  const ok = await safe(async () => {
                    await settleAll(p.id, billGroup.items, date, groupSettleMessage(billGroup));
                    return true;
                  });
                  if (!ok) pendingFocus.current = null;
                }}
              />
            )}
          </div>
          <ul id="bill-list" className="bill-list">
            {money.map(bill)}
          </ul>
        </section>
      )}
      {rest.length > 0 && (
        <section className="card todos" aria-labelledby="todos-title">
          <div className="todos-head">
            <h2 id="todos-title" className="todos-title" tabIndex={-1}>Teendők</h2>
            <Badge tone="strong" className="num" aria-hidden>{rest.length}</Badge>
          </div>
          <ul id="todo-list" className="todo-list">
            {shown.map(row)}
          </ul>
          {rest.length > shown.length && <p className="tiny faint todo-more">és még {rest.length - shown.length} teendő</p>}
        </section>
      )}
    </div>
  );
}

/** „Áram · lejárt okt. 15. · 18 000 Ft” → cím („Áram”) és alsor; elválasztó nélkül csak cím. */
function splitText(text: string): { title: string; sub: string } {
  const m = /( · |: )/.exec(text);
  if (!m) return { title: text, sub: '' };
  return { title: text.slice(0, m.index), sub: text.slice(m.index + m[0].length) };
}
