import { useMemo, useState, type ReactNode } from 'react';
import { tagSummary } from '../../domain/analysis';
import { entryTotals, filterEntries, groupByDay, totalsText, type EntryFilter } from '../../domain/entries';
import { formatFt } from '../../domain/money';
import { periodName, shortDate } from '../../domain/periods';
import type { Category, CategoryType, Entry, ISODate } from '../../domain/types';
import { weekdayName } from '../../domain/weekly';
import { useBudget } from '../context';
import { CatIcon, EmptyState, Icon } from '../components/common';
import { ENTRIES_TITLE_ID } from '../components/EntrySheet';

/** Egyszerre ennyi rögzítés látszik; a „Továbbiak” gomb ennyivel bővíti. */
const PAGE = 50;

const TYPES: { type: CategoryType; all: string; group: string }[] = [
  { type: 'keret', all: 'Minden keret', group: 'Keretek' },
  { type: 'fix', all: 'Minden számla', group: 'Számlák' },
  { type: 'bevetel', all: 'Minden bevétel', group: 'Bevételek' },
  { type: 'megtakaritas', all: 'Minden megtakarítás', group: 'Megtakarítás' },
];

/** 'csütörtök, nov. 12.', a mai évtől eltérő évben az évszámmal. */
function dayTitle(date: ISODate, today: ISODate): string {
  const year = date.slice(0, 4) === today.slice(0, 4) ? '' : `${date.slice(0, 4)}. `;
  return `${weekdayName(date)}, ${year}${shortDate(date)}`;
}

/**
 * Az Elemzés „Rögzítések” nézete: az összes rögzítés időrendben, hónapra, kategóriára és szövegre szűrhetően.
 * Egy sorra koppintva a rögzítés szerkeszthető vagy törölhető.
 */
export function AnalysisEntries({ tabs }: { tabs: ReactNode }) {
  const { data, summaries, today, openQuick } = useBudget();
  const [periodId, setPeriodId] = useState('');
  const [scope, setScope] = useState('');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(PAGE);
  // Szűrőváltáskor a lista az elejéről indul.
  const change = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setLimit(PAGE);
  };

  const cats = useMemo(() => new Map(data.categories.map((c) => [c.id, c])), [data.categories]);
  const filter: EntryFilter = { periodId: periodId || null, scope: scope || null, query: q };
  const list = useMemo(
    () => filterEntries(data.entries, data.categories, { periodId: periodId || null, scope: scope || null, query: q }),
    [data.entries, data.categories, periodId, scope, q],
  );
  // A címkék a hónap és a kategória szűrőjét követik, hogy az összegük a látott listához tartozzon.
  const tags = useMemo(
    () => tagSummary(filterEntries(data.entries, data.categories, { periodId: periodId || null, scope: scope || null, query: '' })),
    [data.entries, data.categories, periodId, scope],
  );
  const totals = useMemo(() => entryTotals(list, data.categories), [list, data.categories]);
  const days = useMemo(() => groupByDay(list.slice(0, limit)), [list, limit]);

  // A választókban csak az szerepel, amihez van rögzítés (és a folyamatban lévő hónap).
  const periods = useMemo(() => {
    const used = new Set(data.entries.map((e) => e.periodId));
    return summaries.periods.filter((p) => used.has(p.id) || p.id === summaries.currentId).map((p) => p.id).reverse();
  }, [data.entries, summaries]);
  const usedCats = useMemo(() => {
    const used = new Set<string>();
    for (const e of data.entries) {
      used.add(e.categoryId);
      if (e.spendCategoryId) used.add(e.spendCategoryId);
    }
    return [...data.categories].filter((c) => used.has(c.id)).sort((a, b) => a.order - b.order);
  }, [data.entries, data.categories]);
  const thisYear = summaries.currentId.slice(0, 4);
  const filtered = !!(filter.periodId || filter.scope || q.trim());
  const reset = () => {
    setPeriodId('');
    setScope('');
    setQ('');
    setLimit(PAGE);
  };

  return (
    <>
      <div className="page-head">{tabs}</div>
      <section className="card" aria-labelledby={ENTRIES_TITLE_ID}>
        <div className="card-head">
          <h2 id={ENTRIES_TITLE_ID} tabIndex={-1}>
            Rögzítések
          </h2>
          <span className="small faint">koppints egy sorra a szerkesztéshez</span>
        </div>
        {data.entries.length === 0 ? (
          <EmptyState
            icon="receipt-off"
            title="Még nincs rögzítés"
            action={
              <button className="btn sm primary" onClick={openQuick}>
                <Icon name="plus" /> Kiadás rögzítése
              </button>
            }
          />
        ) : (
          <>
            <div className="entries-filters">
              <label className="search-box">
                <Icon name="search" />
                <span className="sr-only">Keresés a rögzítésekben</span>
                <input type="search" placeholder="Megjegyzés, kategória, név vagy #címke" value={q} onChange={(e) => change(setQ)(e.target.value)} />
                {q && (
                  <button className="btn sm ghost icon" aria-label="Keresés törlése" onClick={() => change(setQ)('')}>
                    <Icon name="x" />
                  </button>
                )}
              </label>
              <select aria-label="Hónap" value={periodId} onChange={(e) => change(setPeriodId)(e.target.value)}>
                <option value="">Minden hónap</option>
                {periods.map((id) => (
                  <option key={id} value={id}>
                    {periodName(id, id.slice(0, 4) !== thisYear)}
                  </option>
                ))}
              </select>
              <select aria-label="Kategória" value={scope} onChange={(e) => change(setScope)(e.target.value)}>
                <option value="">Minden kategória</option>
                <optgroup label="Típus szerint">
                  {TYPES.filter((t) => usedCats.some((c) => c.type === t.type)).map((t) => (
                    <option key={t.type} value={`t:${t.type}`}>
                      {t.all}
                    </option>
                  ))}
                </optgroup>
                {TYPES.map((t) => {
                  const own = usedCats.filter((c) => c.type === t.type);
                  return own.length === 0 ? null : (
                    <optgroup key={t.type} label={t.group}>
                      {own.map((c) => (
                        <option key={c.id} value={`c:${c.id}`}>
                          {c.name}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
            </div>
            {!q.trim() && tags.length > 0 && (
              <div className="tag-list">
                {tags.map((t) => (
                  <button key={t.tag} className="chip" onClick={() => change(setQ)(`#${t.tag}`)}>
                    <span className="tag-name">#{t.tag}</span>
                    <span className="num">{formatFt(t.total)}</span>
                    <span className="faint num">{t.count} db</span>
                  </button>
                ))}
              </div>
            )}
            <p className="small muted num entries-sum" role="status">
              {totalsText(totals)}
            </p>
            {list.length === 0 ? (
              <EmptyState
                icon="filter-off"
                title="Nincs a szűrőnek megfelelő rögzítés"
                action={
                  <button className="btn sm" onClick={reset}>
                    Szűrők törlése
                  </button>
                }
              />
            ) : (
              days.map((d) => (
                <div key={d.date} role="group" aria-label={dayTitle(d.date, today)}>
                  <h3 className="entries-day num">{dayTitle(d.date, today)}</h3>
                  <ul className="entries-list">
                    {d.entries.map((e) => (
                      <EntryRow key={e.id} e={e} cat={cats.get(e.categoryId)} spendName={e.spendCategoryId ? cats.get(e.spendCategoryId)?.name : undefined} />
                    ))}
                  </ul>
                </div>
              ))
            )}
            {list.length > limit && (
              <button className="rec-more" onClick={() => setLimit(limit + PAGE)}>
                <Icon name="chevron-down" className="chev" />
                Továbbiak ({list.length - limit} van még)
              </button>
            )}
            {!filtered && tags.length === 0 && (
              <p className="tiny muted entries-tip">
                Tipp: írj címkét a megjegyzésbe, pl. <strong>#nyaralás</strong> vagy <strong>#autó</strong>, és itt egy koppintással szűrhetsz rá.
              </p>
            )}
          </>
        )}
      </section>
    </>
  );
}

function EntryRow({ e, cat, spendName }: { e: Entry; cat?: Category; spendName?: string }) {
  const { openEntry } = useBudget();
  const name = cat?.name ?? 'Ismeretlen kategória';
  const sign = e.kind === 'withdrawal' ? '−' : cat?.type === 'bevetel' ? '+' : '';
  const sub = [
    e.createdBy,
    e.kind === 'withdrawal' && `megtakarításból${spendName ? ` → ${spendName}` : ''}`,
    e.settles && 'lezárva',
    e.monthlyTotal && 'havi összeg',
  ].filter(Boolean);
  return (
    <li>
      <button
        className="entries-row"
        data-entry-row={e.id}
        onClick={() => openEntry(e.id)}
        aria-label={`${name}${e.note ? `, ${e.note}` : ''}: ${sign}${formatFt(e.amount)}${sub.length ? `, ${sub.join(', ')}` : ''}. Szerkesztés`}
      >
        <CatIcon cat={cat ?? { icon: 'question-mark', color: '#8a8983' }} />
        <span className="recent-main">
          <span className="small recent-name">
            {name}
            {e.note && <span className="muted"> · {e.note}</span>}
          </span>
          {sub.length > 0 && <span className="tiny faint entries-sub">{sub.join(' · ')}</span>}
        </span>
        <span className={`small num entries-amount ${sign === '+' ? 'pos' : ''}`}>
          {sign}
          {formatFt(e.amount)}
        </span>
        <Icon name="chevron-right" className="chev" />
      </button>
    </li>
  );
}
