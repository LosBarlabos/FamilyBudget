import { useEffect, useMemo, useRef, useState } from 'react';
import {
  applyEdit, categoryChoices, editErrors, editLimits, editNotes, editScope, entryChanged, spendChoices, type EditErrors,
} from '../../domain/entries';
import { goalProgress } from '../../domain/goals';
import { formatFt, parseAmount } from '../../domain/money';
import { recordedAtText } from '../../domain/quick';
import type { Category, CategoryType, Entry } from '../../domain/types';
import { deleteEntry, restoreEntries, updateEntry } from '../../db/repo';
import { useBudget, useToast } from '../context';
import { writeError } from '../errors';
import { CatIcon, Icon, NOTE_TAGS_LIST, useFieldErrors } from './common';
import { Sheet } from './Sheet';
import { weekRowSelector } from './WeekSheet';

// A lap neve a router memóriabeli rétegében: „entry|<rögzítésId>”.
const PREFIX = 'entry|';
export const entrySheetName = (id: string) => `${PREFIX}${id}`;
export const parseEntrySheet = (name: string | null) => (name?.startsWith(PREFIX) ? name.slice(PREFIX.length) : null);

/** A rögzítés sora (vagy a sor szerkesztés gombja) bármelyik listában: bezáráskor ide kerül vissza a fókusz. */
export const entryRowSelector = (id: string) => `[data-entry-row="${CSS.escape(id)}"]`;
/** A Rögzítések lista címe: törlés után, amikor a sor már nincs meg, ez kapja a fókuszt. */
export const ENTRIES_TITLE_ID = 'entries-title';

/**
 * Egy rögzítés szerkesztése: összeg, nap, kategória, megjegyzés. Mindenhonnan megnyílik, ahol rögzítés látszik.
 * A mentés és a törlés is visszavonható az értesítésből.
 */
export function EntrySheet({ entryId, onClose }: { entryId: string; onClose: () => void }) {
  const { data } = useBudget();
  const entry = data.entries.find((e) => e.id === entryId);
  // Mentés vagy törlés után a lap akkor zárul be, amikor a lista már az új állapotot mutatja. Így a fókusz a
  // rögzítés új helyére kerülhet (a nap módosításával a sora máshová kerül), vagy ha már nincs meg, a lista címére.
  const [written, setWritten] = useState<{ before: Entry | undefined } | null>(null);
  useEffect(() => {
    if (!written) return;
    if (entry !== written.before) return onClose();
    // Védőháló: ha a frissített adat késne, a lap akkor se maradjon nyitva.
    const t = window.setTimeout(onClose, 1500);
    return () => window.clearTimeout(t);
  }, [written, entry, onClose]);
  const rowCategory = entry ? (entry.kind === 'withdrawal' ? entry.spendCategoryId : entry.categoryId) : undefined;
  const fallbackFocus = () =>
    document.querySelector<HTMLElement>(entryRowSelector(entryId)) ??
    (rowCategory ? document.querySelector<HTMLElement>(weekRowSelector(rowCategory)) : null) ??
    document.getElementById(ENTRIES_TITLE_ID);
  return (
    <Sheet title="Rögzítés szerkesztése" onClose={onClose} fallbackFocus={fallbackFocus}>
      {entry ? (
        <EntryForm entry={entry} onClose={onClose} onWritten={() => setWritten({ before: entry })} />
      ) : written ? null : (
        <p className="small muted">Ez a rögzítés már nem található.</p>
      )}
    </Sheet>
  );
}

const GROUPS: { type: CategoryType; label: string }[] = [
  { type: 'keret', label: 'Keretek' },
  { type: 'fix', label: 'Számlák' },
  { type: 'bevetel', label: 'Bevételek' },
];

/** A kategóriák a választóban típusonként csoportosítva (keretek, számlák). */
function CategoryOptions({ list }: { list: Category[] }) {
  const option = (c: Category) => (
    <option key={c.id} value={c.id}>
      {c.name}
      {c.archived ? ' (archivált)' : ''}
    </option>
  );
  const groups = GROUPS.map((g) => ({ ...g, own: list.filter((c) => c.type === g.type) })).filter((g) => g.own.length > 0);
  if (groups.length < 2) return <>{list.map(option)}</>;
  return (
    <>
      {groups.map((g) => (
        <optgroup key={g.type} label={g.label}>
          {g.own.map(option)}
        </optgroup>
      ))}
    </>
  );
}

function EntryForm({ entry, onClose, onWritten }: { entry: Entry; onClose: () => void; onWritten: () => void }) {
  const { data, summaries, cfg, today } = useBudget();
  const toast = useToast();
  const cat = data.categories.find((c) => c.id === entry.categoryId);
  const scope = editScope(entry, cat);
  const choices = useMemo(() => categoryChoices(entry, data.categories), [entry, data.categories]);
  const spends = useMemo(() => spendChoices(entry, data.categories), [entry, data.categories]);
  const saved = entry.kind === 'withdrawal' && cat ? goalProgress(cat, data, summaries.currentId).saved : null;
  const limits = editLimits(entry, summaries.periods[0].start, today, saved);

  const [amountText, setAmountText] = useState(String(entry.amount));
  const [date, setDate] = useState(entry.date);
  const [categoryId, setCategoryId] = useState(entry.categoryId);
  const [note, setNote] = useState(entry.note ?? '');
  const [spendId, setSpendId] = useState(entry.spendCategoryId ?? '');
  const { field, message, check } = useFieldErrors<keyof EditErrors>();
  // Folyamatban lévő mentés alatt a dupla Enter vagy kattintás ne írjon kétszer.
  const busy = useRef(false);
  const [pending, setPending] = useState(false);

  // A „Nem volt” lezárás 0 Ft-os: az úgy is maradhat.
  const amount = entry.settles && amountText.trim() === '0' ? 0 : parseAmount(amountText);
  const draft = { amount, date, categoryId, note, spendCategoryId: spendId };
  const errors = editErrors(entry, draft, limits);
  const next = amount !== null && Object.keys(errors).length === 0 ? applyEdit(entry, { ...draft, amount }, data.categories, cfg) : null;
  // Beírás közben látszik, ha a módosítás másik vagy lezárt hónapot érint.
  const notes = next ? editNotes(entry, next, summaries.currentId) : [];
  const nameOf = (id: string) => data.categories.find((c) => c.id === id)?.name ?? 'Rögzítés';

  // Siker után a mezők letiltva maradnak: a lap bezárul, amint a lista frissült (lásd EntrySheet).
  const run = async (fn: () => Promise<void>) => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    try {
      await fn();
      onWritten();
    } catch (e) {
      // A lap nyitva marad a beírt értékekkel, hogy újra lehessen próbálni.
      console.error(e);
      toast(writeError(e), undefined, 'error');
      busy.current = false;
      setPending(false);
    }
  };

  const save = () => {
    if (!check(amountText.trim() === '' ? { ...errors, amount: 'Adj meg egy összeget' } : errors) || !next) return;
    if (!entryChanged(entry, next)) return onClose();
    return run(async () => {
      const old = await updateEntry(next);
      if (old) toast(`${nameOf(next.categoryId)}: rögzítés módosítva (${formatFt(next.amount)})`, () => restoreEntries([old]));
    });
  };

  const remove = () =>
    run(async () => {
      const old = await deleteEntry(entry.id);
      if (old) toast(`${nameOf(old.categoryId)}: ${formatFt(old.amount)} törölve`, () => restoreEntries([old]));
    });

  const meta = [
    `Rögzítve: ${recordedAtText(entry.createdAt, today)}`,
    entry.createdBy,
    entry.kind === 'withdrawal' && 'megtakarításból',
    entry.settles && 'lezáró rögzítés',
    entry.monthlyTotal && 'havi összeg',
  ].filter(Boolean);

  return (
    <form
      className="entry-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="cover-target">
        <CatIcon cat={cat ?? { icon: 'question-mark', color: '#8a8983' }} />
        <div className="cover-main">
          <div className="cover-name">{cat?.name ?? 'Ismeretlen kategória'}</div>
          <div className="tiny faint num">{meta.join(' · ')}</div>
        </div>
      </div>

      <label className="field">
        Összeg
        <span className="cover-amount">
          <input
            type="text"
            inputMode="numeric"
            className="num"
            value={amountText}
            disabled={pending}
            onChange={(e) => {
              setAmountText(e.target.value);
              check({});
            }}
            {...field('amount')}
          />
          <span className="muted">Ft</span>
        </span>
        {message('amount')}
      </label>

      <div className="entry-grid">
        {scope.date && (
          <label className="field">
            Nap
            <input
              type="date"
              value={date}
              min={limits.minDate}
              max={limits.maxDate}
              disabled={pending}
              onChange={(e) => {
                setDate(e.target.value);
                check({});
              }}
              {...field('date')}
            />
            {message('date')}
          </label>
        )}
        {scope.category && choices.length > 1 && (
          <label className="field">
            Kategória
            <select value={categoryId} disabled={pending} onChange={(e) => setCategoryId(e.target.value)}>
              <CategoryOptions list={choices} />
            </select>
          </label>
        )}
        {scope.spend && (
          <label className="field">
            Mire ment?
            <select value={spendId} disabled={pending} onChange={(e) => setSpendId(e.target.value)}>
              <option value="">Nincs megadva</option>
              <CategoryOptions list={spends} />
            </select>
          </label>
        )}
      </div>

      <label className="field">
        Megjegyzés
        <input type="text" list={NOTE_TAGS_LIST} value={note} disabled={pending} placeholder="nem kötelező" onChange={(e) => setNote(e.target.value)} />
      </label>

      {entry.monthlyTotal && (
        <p className="small muted m-0">Ez a rögzítés a hónap egészét összegzi („Havi összeg megadása”), ezért a napja és a kategóriája nem módosítható.</p>
      )}
      {notes.length > 0 && (
        <div className="cover-note small" role="status">
          <Icon name="info-circle" />
          <span>{notes.join(' ')}</span>
        </div>
      )}

      <div className="entry-actions">
        <button type="button" className="btn danger" disabled={pending} onClick={remove}>
          <Icon name="trash" /> Törlés
        </button>
        <button type="submit" className="btn primary" disabled={pending} aria-busy={pending}>
          <Icon name="check" /> Mentés
        </button>
      </div>
    </form>
  );
}
