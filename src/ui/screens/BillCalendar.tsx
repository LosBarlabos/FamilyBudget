import { addMonths, getDaysInMonth } from 'date-fns';
import { useMemo, useState } from 'react';
import { buildIcs, calendarEvents, icsBills, icsSnapshot, icsStale, type CalendarEvent, type CalendarState, type IcsSnapshot } from '../../domain/calendar';
import { formatFt } from '../../domain/money';
import { fromISO, MONTHS, shortDate, toISO } from '../../domain/periods';
import { useBudget } from '../context';
import { CatIcon, downloadFile, EmptyState, Icon, useLocalState } from '../components/common';

/** A letöltött naptárfájl lenyomata ezen az eszközön (a naptár importja is eszközönkénti). */
const ICS_KEY = 'calendar-ics';
const WEEKDAYS = ['H', 'K', 'Sze', 'Cs', 'P', 'Szo', 'V'];

const STATE_LABEL: Record<CalendarState, string> = {
  paid: 'kifizetve',
  auto: 'automatikusan kifizetve',
  partial: 'részben kifizetve',
  open: 'esedékes',
  overdue: 'lejárt',
};

/** A nap pöttye a legsürgősebb tétele szerint: lejárt > nyitott számla > bevétel > kész. */
function dayTone(events: CalendarEvent[]): string | null {
  if (events.length === 0) return null;
  if (events.some((e) => e.state === 'overdue')) return 'late';
  if (events.some((e) => e.kind === 'bill' && (e.state === 'open' || e.state === 'partial'))) return 'open';
  if (events.some((e) => e.kind === 'income' && e.state !== 'paid')) return 'income';
  return 'done';
}

function eventText(e: CalendarEvent): string {
  if (e.kind === 'income') return e.state === 'paid' ? 'megérkezett' : e.state === 'partial' ? 'részben megérkezett' : 'várható';
  return e.autoPay && e.state === 'open' ? 'csoportos beszedés' : STATE_LABEL[e.state];
}

export function BillCalendar() {
  const { data, summaries, today, go, setPeriodId } = useBudget();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [day, setDay] = useState<string | null>(null);
  // Csak az ismert időszakok hónapjai lapozhatók (az első időszaktól az előrejelzés végéig).
  const minMonth = summaries.periods[0].start.slice(0, 7);
  const maxMonth = summaries.periods.at(-1)!.end.slice(0, 7);
  const first = fromISO(`${month}-01`);
  const days = getDaysInMonth(first);
  const monthStart = `${month}-01`;
  const monthEnd = `${month}-${String(days).padStart(2, '0')}`;
  const events = useMemo(
    () => calendarEvents(data.categories, summaries, monthStart, monthEnd, today),
    [data.categories, summaries, monthStart, monthEnd, today],
  );
  const byDay = new Map<string, CalendarEvent[]>();
  for (const e of events) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);
  // Hétfővel kezdődő hét: ennyi üres cella kell a hónap első napja elé.
  const lead = (first.getDay() + 6) % 7;
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)];

  const shown = day ? (byDay.get(day) ?? []) : events;
  const billTotal = events.filter((e) => e.kind === 'bill').reduce((s, e) => s + e.amount, 0);
  const incomeTotal = events.filter((e) => e.kind === 'income').reduce((s, e) => s + e.amount, 0);
  const shift = (n: number) => {
    setMonth(toISO(addMonths(first, n)).slice(0, 7));
    setDay(null);
  };
  const open = (e: CalendarEvent) => {
    setPeriodId(e.periodId);
    go('record', e.cat.id);
  };

  return (
    <>
      <div className="page-head">
        <h1 className="page-title">Számlanaptár</h1>
        <div className="cal-nav">
          <button className="btn icon" aria-label="Előző hónap" disabled={month <= minMonth} onClick={() => shift(-1)}>
            <Icon name="chevron-left" />
          </button>
          <span className="cal-month">{month.slice(0, 4)}. {MONTHS[first.getMonth()].toLowerCase()}</span>
          <button className="btn icon" aria-label="Következő hónap" disabled={month >= maxMonth} onClick={() => shift(1)}>
            <Icon name="chevron-right" />
          </button>
        </div>
      </div>

      <div className="cal-layout">
        <section className="card" aria-label="Havi naptár">
          <div className="cal-grid" role="grid" aria-label={`${month.slice(0, 4)}. ${MONTHS[first.getMonth()].toLowerCase()}`}>
            {WEEKDAYS.map((w) => (
              <span key={w} className="cal-wd" aria-hidden="true">{w}</span>
            ))}
            {cells.map((d, i) => {
              if (!d) return <span key={`x${i}`} />;
              const list = byDay.get(d) ?? [];
              const tone = dayTone(list);
              const label = `${shortDate(d)}${list.length ? `: ${list.map((e) => e.cat.name).join(', ')}` : ''}`;
              return (
                <button
                  key={d}
                  className={`cal-day ${d === today ? 'today' : ''} ${d === day ? 'on' : ''} ${tone ? 'has' : ''}`}
                  aria-label={label}
                  aria-pressed={d === day}
                  disabled={list.length === 0}
                  onClick={() => setDay(d === day ? null : d)}
                >
                  {Number(d.slice(8))}
                  <span className={`cal-dot ${tone ?? ''}`} aria-hidden="true" />
                </button>
              );
            })}
          </div>
          <div className="cal-legend tiny muted" aria-hidden="true">
            <span><i className="cal-dot late" /> lejárt</span>
            <span><i className="cal-dot open" /> esedékes</span>
            <span><i className="cal-dot income" /> bevétel</span>
            <span><i className="cal-dot done" /> kész</span>
          </div>
        </section>

        <section className="card" aria-labelledby="cal-list-title">
          <div className="card-head">
            <h2 id="cal-list-title">{day ? shortDate(day) : 'A hónap tételei'}</h2>
            {day ? (
              <button className="btn sm ghost" onClick={() => setDay(null)}>Az egész hónap</button>
            ) : (
              <span className="small muted num">számlák {formatFt(billTotal)} · bevétel {formatFt(incomeTotal)}</span>
            )}
          </div>
          {shown.length === 0 ? (
            <EmptyState
              icon="calendar-off"
              title="Ebben a hónapban nincs esedékes számla"
              action={<button className="btn sm" onClick={() => go('categories')}>Esedékességi nap megadása</button>}
            >
              A naptárban azok a fix számlák látszanak, amelyeknek van esedékességi napja. Ezt a Kategóriákban állíthatod be.
            </EmptyState>
          ) : (
            <div className="cal-list">
              {shown.map((e) => (
                <button key={`${e.periodId}-${e.cat.id}`} className="cal-row" onClick={() => open(e)}>
                  <span className="cal-date num">{shortDate(e.date)}</span>
                  <CatIcon cat={e.cat} />
                  <span className="cal-main">
                    <span className="rec-name">{e.cat.name}</span>
                    <span className={`tiny ${e.state === 'overdue' ? 'neg' : e.state === 'paid' || e.state === 'auto' ? 'pos' : 'muted'}`}>
                      {eventText(e)}
                    </span>
                  </span>
                  <span className={`num cal-amount ${e.kind === 'income' ? 'pos' : ''}`}>
                    {e.kind === 'income' ? '+' : ''}
                    {formatFt(e.amount)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      <Reminders onCategories={() => go('categories')} />
    </>
  );
}

/** Emlékeztető a telefon naptárával: a számlák .ics fájlként, előző esti értesítéssel. */
function Reminders({ onCategories }: { onCategories: () => void }) {
  const { data, summaries, today } = useBudget();
  const [saved, setSaved] = useLocalState<IcsSnapshot | null>(ICS_KEY, null);
  const bills = useMemo(() => icsBills(data.categories, summaries, today), [data.categories, summaries, today]);
  const stale = saved !== null && icsStale(saved, bills, today);

  const download = () => {
    downloadFile('szamlak.ics', buildIcs(bills, new Date()), 'text/calendar;charset=utf-8');
    setSaved(icsSnapshot(bills));
  };

  return (
    <section className="card" aria-labelledby="cal-remind-title">
      <div className="card-head">
        <h2 className="cluster gap-2" id="cal-remind-title">
          <Icon name="bell-ringing" style={{ color: 'var(--color-text-subtle)' }} /> Emlékeztető a telefonodon
        </h2>
      </div>
      {bills.length === 0 ? (
        <p className="small muted">
          Még egyik fix számlának sincs esedékességi napja. Add meg a Kategóriákban, és a naptár emlékeztetni tud.{' '}
          <button className="btn sm" onClick={onCategories}>Kategóriák</button>
        </p>
      ) : (
        <>
          {stale && (
            <div className="callout tone-warn" role="status">
              <Icon name="alert-triangle" />
              <span className="callout-text">A számlák változtak a letöltés óta. Töltsd le újra, és importáld a naptáradba.</span>
            </div>
          )}
          <p className="small muted" style={{ margin: '0 0 12px' }}>
            Letöltheted a következő hónapok számláit naptárfájlként. A telefonon megnyitva a naptáradba kerülnek, és a
            naptár minden esedékesség előtti este 20:00-kor emlékeztet, akkor is, ha az app zárva van.
          </p>
          <div className="cluster wrap gap-3">
            <button className={`btn ${saved && !stale ? '' : 'primary'}`} onClick={download}>
              <Icon name="calendar-plus" /> {saved ? 'Újra letöltöm' : 'Naptárfájl letöltése'}
            </button>
            <span className="tiny faint">
              {bills.length} számla, {shortDate(bills[0].date)} – {shortDate(bills.at(-1)!.date)}
              {saved && !stale ? ' · a letöltött fájl naprakész' : ''}
            </span>
          </div>
          {saved && (
            <p className="tiny faint" style={{ margin: '10px 0 0' }}>
              Újraimportálás előtt töröld a naptárból a korábban importált számlákat, különben kétszer szerepelhetnek.
            </p>
          )}
        </>
      )}
    </section>
  );
}
