import { useId, useMemo, useRef, useState } from 'react';
import { formatFt, parseAmount } from '../../domain/money';
import { clampToPeriod, periodName, periodShortName, shiftPeriod, shortDate } from '../../domain/periods';
import { billChipText, offersPreviousPeriod, quickEnvelopes, suggestedAmounts } from '../../domain/quick';
import { settleLabel } from '../../domain/status';
import { dueBills, type BillTodo } from '../../domain/todos';
import type { Category } from '../../domain/types';
import { addEntry, restoreEntries } from '../../db/repo';
import { useSettleRest } from '../actions';
import { UNEXPECTED_PANEL, useBudget, useToast } from '../context';
import { writeError } from '../errors';
import { CatIcon, Icon, useLocalState } from './common';
import { Sheet } from './Sheet';
import { handOffUnexpected } from './UnexpectedExpense';

/**
 * Gyors rögzítés bárhonnan (+ gomb, N billentyű, `?gyors`): összeg, majd egy koppintás a keretre vagy egy
 * esedékes számlára. A folyamatban lévő időszakba, a mai napra rögzít; az új időszak első napjaiban az előzőbe is.
 */
export function QuickEntry({ onClose }: { onClose: () => void }) {
  const { data, summaries, cfg, today, go, setPeriodId } = useBudget();
  const toast = useToast();
  const settleRest = useSettleRest();

  // A folyamatban lévő időszakba, akármelyik időszakot nézi épp a felhasználó: ez a „most költöttem” helye.
  const currentId = summaries.currentId;
  const prevId = shiftPeriod(currentId, -1);
  const canPickPrev = offersPreviousPeriod(summaries.byId.get(currentId)!.start, today) && summaries.byId.has(prevId);
  // A választás az „előző” jelző, nem az azonosító: fizetésnapi éjfélen a régi folyamatban lévő lesz az előző,
  // és a nyitva hagyott panel nem válthat át rá magától.
  const [prevChosen, setPrevChosen] = useState(false);
  const periodId = canPickPrev && prevChosen ? prevId : currentId;
  const p = summaries.byId.get(periodId)!;
  const date = clampToPeriod(today, periodId, cfg);

  const cats = useMemo(() => quickEnvelopes(data.categories, data.entries, today), [data.categories, data.entries, today]);
  const bills = useMemo(() => dueBills(data.categories, p, today), [data.categories, p, today]);
  const [lastId, setLastId] = useLocalState('quick-category', '');
  // Az Enter az utoljára itt használt keretbe rögzít (ha még létezik), különben a leggyakoribba.
  const def = cats.find((c) => c.id === lastId) ?? cats[0];
  const suggested = useMemo(() => (def ? suggestedAmounts(data.entries, def.id, periodId) : []), [data.entries, def, periodId]);

  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);
  const [error, setError] = useState('');
  // Folyamatban lévő mentés alatt a dupla Enter vagy koppintás ne rögzítsen kétszer.
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const envTitleId = useId();
  const billTitleId = useId();

  const fail = (msg: string) => {
    setError(msg);
    amountRef.current?.focus();
  };

  const run = async (save: () => Promise<void>) => {
    busy.current = true;
    setPending(true);
    try {
      await save();
      onClose();
    } catch (err) {
      // A beírt összeg megmarad, hogy újra lehessen próbálni.
      console.error(err);
      toast(writeError(err), undefined, 'error');
    } finally {
      busy.current = false;
      setPending(false);
    }
  };

  const recordEnvelope = (cat: Category) => {
    if (busy.current) return;
    const amount = parseAmount(text);
    if (amount === null) return fail(text.trim() ? 'Ez nem érvényes összeg' : 'Előbb írd be az összeget');
    return run(async () => {
      const e = await addEntry(periodId, cat.id, amount, date, note.trim() || undefined);
      setLastId(cat.id);
      toast(`${cat.name}: +${formatFt(amount)}`, () => restoreEntries([], [e.id]));
    });
  };

  // Üres mezővel a hátralékkal zár (mint a „Kifizetve”), beírt összeggel azzal (mint a „Más összeg”).
  const settleBill = (b: BillTodo) => {
    if (busy.current) return;
    const amount = text.trim() ? parseAmount(text) : b.amount;
    if (amount === null) return fail('Ez nem érvényes összeg');
    return run(() => settleRest(periodId, b.cat, amount, date, b.partial, note.trim() || undefined));
  };

  const onEnter = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && def) {
      e.preventDefault();
      recordEnvelope(def);
    }
  };

  // A chip koppintása ne vegye el a fókuszt az összegmezőtől: mobilon így nem csukódik le a billentyűzet
  // (és nem ugrik el a lap) a koppintás közben.
  const keepFocus = (e: React.MouseEvent) => {
    if (document.activeElement === amountRef.current) e.preventDefault();
  };

  // A Váratlan kiadás panel a kiválasztott időszakba rögzít: ugyanoda kerüljön, ahová a gyorsrögzítő is írna,
  // és a beírt összeg és megjegyzés se vesszen el.
  const unexpected = () => {
    handOffUnexpected({ amount: text, note });
    setPeriodId(periodId);
    go('record', UNEXPECTED_PANEL);
  };

  return (
    <Sheet title="Gyors rögzítés" onClose={onClose}>
      <div className="quick">
        <div className="quick-amount">
          <input
            ref={amountRef}
            type="text"
            inputMode="decimal"
            className="num"
            autoFocus
            placeholder="0"
            aria-label="Összeg"
            aria-invalid={!!error}
            aria-describedby={error ? errorId : undefined}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setError('');
            }}
            onKeyDown={onEnter}
          />
          <span className="muted">Ft</span>
        </div>
        {error && (
          <div id={errorId} className="error" role="alert">
            {error}
          </div>
        )}

        {def && (
          <div className="quick-sugg" role="group" aria-label={`Javasolt összegek: ${def.name}`}>
            <span className="tiny faint">Javasolt ({def.name}):</span>
            {suggested.map((q) => (
              <button
                key={q}
                className="sm num"
                disabled={pending}
                aria-label={`${formatFt(q)} beírása`}
                onMouseDown={keepFocus}
                onClick={() => {
                  setText(String(q));
                  setError('');
                }}
              >
                {formatFt(q)}
              </button>
            ))}
          </div>
        )}

        {canPickPrev && (
          <div className="quick-period">
            <div className="seg" role="group" aria-label="Melyik időszakba">
              {[currentId, prevId].map((id) => (
                <button key={id} className={periodId === id ? 'on' : ''} aria-pressed={periodId === id} onClick={() => setPrevChosen(id === prevId)}>
                  {periodShortName(id)}.
                </button>
              ))}
            </div>
            <span className="tiny faint">Az új időszak első napjaiban az előzőbe is rögzíthetsz.</span>
          </div>
        )}

        <div role="group" aria-labelledby={envTitleId}>
          <div id={envTitleId} className="quick-title">Melyik keretből?</div>
          {cats.length === 0 ? (
            <p className="small muted" style={{ margin: 0 }}>
              Még nincs keret kategória (pl. Élelmiszer), amibe gyorsan rögzíthetnél.{' '}
              <button className="link" onClick={() => go('categories')}>Kategóriák</button>
            </p>
          ) : (
            <div className="chips">
              {cats.map((c) => (
                <button
                  key={c.id}
                  className={`chip-btn ${c.id === def?.id ? 'on' : ''}`}
                  disabled={pending}
                  aria-keyshortcuts={c.id === def?.id ? 'Enter' : undefined}
                  onMouseDown={keepFocus}
                  onClick={() => recordEnvelope(c)}
                >
                  <CatIcon cat={c} />
                  <span className="chip-label">{c.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {bills.length > 0 && (
          <div role="group" aria-labelledby={billTitleId}>
            <div id={billTitleId} className="quick-title">Esedékes számlák</div>
            <div className="chips">
              {bills.map((b) => (
                <button
                  key={b.cat.id}
                  className={`chip-btn num ${b.overdue ? 'late' : ''}`}
                  disabled={pending}
                  title={`${b.overdue ? 'Lejárt' : 'Esedékes'}: ${shortDate(b.due)}`}
                  aria-label={`${b.cat.name}: ${settleLabel(b.cat.type, b.partial).toLowerCase()}, ${
                    b.partial ? 'hátralék' : 'terv'
                  } ${formatFt(b.amount)}, ${b.overdue ? 'lejárt' : 'esedékes'} ${shortDate(b.due)}`}
                  onMouseDown={keepFocus}
                  onClick={() => settleBill(b)}
                >
                  <CatIcon cat={b.cat} />
                  <span className="chip-label">{billChipText(b.cat.name, b.amount)}</span>
                </button>
              ))}
            </div>
            <div className="tiny faint" style={{ marginTop: 6 }}>
              Koppintásra lezárja: üres mezőnél a látható összeggel, beírt összegnél azzal.
            </div>
          </div>
        )}

        {noteOpen ? (
          <input
            type="text"
            className="quick-note"
            autoFocus
            placeholder="Megjegyzés"
            aria-label="Megjegyzés (nem kötelező)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={onEnter}
          />
        ) : (
          <button className="sm ghost quick-note-toggle" onClick={() => setNoteOpen(true)}>
            <Icon name="plus" /> Megjegyzés
          </button>
        )}

        <div className="quick-foot">
          <span className="small muted">
            {periodName(periodId)} időszak · {shortDate(date)}
            {def && <span className="kbd-hint faint"> · Enter: {def.name}</span>}
          </span>
          <button className="sm ghost" onClick={unexpected}>
            <Icon name="alert-triangle" /> Váratlan kiadás
          </button>
        </div>
      </div>
    </Sheet>
  );
}
