import { useId, useMemo, useRef, useState } from 'react';
import { formatFt, parseAmount } from '../../domain/money';
import { clampToPeriod, periodName, periodShortName, shiftPeriod, shortDate } from '../../domain/periods';
import { countsInDaily, paceOverview } from '../../domain/pace';
import { afterEntryText, envelopeChipText, offersPreviousPeriod, quickEnvelopes, suggestedAmounts } from '../../domain/quick';
import { settleLabel } from '../../domain/status';
import { billWhenText, dueBills, type BillTodo } from '../../domain/todos';
import type { Category } from '../../domain/types';
import { addEntry, restoreEntries } from '../../db/repo';
import { useSettleRest } from '../actions';
import { UNEXPECTED_PANEL, useBudget, useToast } from '../context';
import { writeError } from '../errors';
import { CatIcon, Icon, NOTE_TAGS_LIST, Segmented, useCoarsePointer, useLocalState } from './common';
import { Sheet } from './Sheet';
import { handOffUnexpected } from './UnexpectedExpense';

/** A számbillentyűzet gombjai, soronként balról jobbra. */
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', 'del'] as const;
/** Legfeljebb ennyi számjegy (999 millió Ft alatt). */
const MAX_DIGITS = 9;

/** '4500' → '4 500' a kijelzőn (csak tiszta számjegyeknél; a kézzel gépelt formát nem írja át). */
const grouped = (t: string) => (/^\d+$/.test(t) ? Number(t).toLocaleString('hu-HU') : t);

/**
 * Gyors rögzítés bárhonnan (+ gomb, N billentyű, `?gyors`): összeg, a keret kiválasztása (alapból az utoljára
 * használt), és a mentés gomb, amely kimondja, hová rögzít. Rögzítés előtt látszik, mennyi marad utána a keretben.
 * Érintőképernyőn saját számbillentyűzet van a hüvelykujj magasságában, így a telefon billentyűzete nem takarja
 * el a kereteket. Esedékes számla egy koppintással is lezárható. A folyamatban lévő időszakba, a mai napra
 * rögzít; az új időszak első napjaiban az előzőbe is.
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
  // Alapból az utoljára itt használt keret van kiválasztva (ha még létezik), különben a leggyakoribb.
  const [selId, setSelId] = useState<string | null>(null);
  const def = cats.find((c) => c.id === (selId ?? lastId)) ?? cats[0];
  const suggested = useMemo(() => (def ? suggestedAmounts(data.entries, def.id, periodId) : []), [data.entries, def, periodId]);
  const pace = useMemo(() => paceOverview(data.categories, p, today), [data.categories, p, today]);
  const coarse = useCoarsePointer();

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
  const previewId = useId();

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

  const amount = parseAmount(text);
  const envOf = (c: Category) => pace.byId.get(c.id);
  const selEnv = def ? envOf(def) : undefined;
  const preview =
    def && amount !== null && amount > 0
      ? afterEntryText(def.name, selEnv?.plan ?? 0, selEnv?.left ?? 0, amount, p.status === 'current' && countsInDaily(def) ? pace.days.remaining : null)
      : null;

  const press = (k: (typeof KEYS)[number]) => {
    setError('');
    setText((t) => {
      const digits = t.replace(/\s/g, '');
      if (k === 'del') return digits.slice(0, -1);
      return (digits + k).replace(/^0+(?=\d)/, '').slice(0, MAX_DIGITS);
    });
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
            inputMode={coarse ? 'none' : 'decimal'}
            className="num"
            autoFocus
            placeholder="0"
            aria-label="Összeg"
            aria-invalid={!!error}
            aria-describedby={error ? errorId : preview ? previewId : undefined}
            value={coarse ? grouped(text) : text}
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
        {preview && !error && (
          <p id={previewId} className="quick-after num" aria-live="polite">
            {preview}
          </p>
        )}

        {def && (
          <div className="quick-sugg" role="group" aria-label={`Javasolt összegek: ${def.name}`}>
            <span className="tiny faint">Javasolt ({def.name}):</span>
            {suggested.map((q) => (
              <button
                key={q}
                className="btn sm num"
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
            <Segmented
              label="Melyik hónapba"
              options={[currentId, prevId].map((id) => ({ id, label: `${periodShortName(id)}.` }))}
              value={periodId}
              onChange={(id) => setPrevChosen(id === prevId)}
            />
            <span className="tiny faint">Az új hónap első napjaiban az előzőbe is rögzíthetsz.</span>
          </div>
        )}

        <div role="group" aria-labelledby={envTitleId}>
          <div id={envTitleId} className="quick-title">Melyik keretből?</div>
          {cats.length === 0 ? (
            <p className="small muted m-0">
              Még nincs keret kategória (pl. Élelmiszer), amibe gyorsan rögzíthetnél.{' '}
              <button className="btn link" onClick={() => go('categories')}>Kategóriák</button>
            </p>
          ) : (
            <div className="quick-envs">
              {cats.map((c) => {
                const env = envOf(c);
                const on = c.id === def?.id;
                return (
                  <button
                    key={c.id}
                    className={`quick-env ${on ? 'on' : ''} ${env && env.plan > 0 && env.left < 0 ? 'over' : ''}`}
                    aria-pressed={on}
                    disabled={pending}
                    onMouseDown={keepFocus}
                    onClick={() => {
                      setSelId(c.id);
                      setError('');
                    }}
                  >
                    <CatIcon cat={c} size="sm" />
                    <span className="quick-env-text">
                      <span className="quick-env-name">{c.name}</span>
                      <span className="quick-env-left num">{envelopeChipText(env?.plan ?? 0, env?.left ?? 0)}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {bills.length > 0 && (
          <div role="group" aria-labelledby={billTitleId}>
            <div id={billTitleId} className="quick-title">Esedékes számlák</div>
            <div className="quick-bills">
              {bills.map((b) => (
                <button
                  key={b.cat.id}
                  className={`quick-bill num ${b.overdue ? 'overdue' : ''}`}
                  disabled={pending}
                  aria-label={`${b.cat.name}: ${settleLabel(b.cat.type, b.partial).toLowerCase()}, ${
                    b.partial ? 'hátralék' : 'terv'
                  } ${formatFt(b.amount)}, ${billWhenText(b, today)}`}
                  onMouseDown={keepFocus}
                  onClick={() => settleBill(b)}
                >
                  <span className="quick-bill-text">
                    <strong>{b.cat.name}</strong> {billWhenText(b, today)}
                  </span>
                  <span className="quick-bill-amount">{formatFt(b.amount)}</span>
                </button>
              ))}
            </div>
            <div className="tiny faint mt-1-5">
              Koppintásra kifizetettnek jelöli: üres mezőnél a látható összeggel, beírt összegnél azzal.
            </div>
          </div>
        )}

        {noteOpen ? (
          <input
            type="text"
            className="quick-note"
            list={NOTE_TAGS_LIST}
            autoFocus
            placeholder="Megjegyzés"
            aria-label="Megjegyzés (nem kötelező)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={onEnter}
          />
        ) : (
          <button className="btn sm ghost quick-note-toggle" onClick={() => setNoteOpen(true)}>
            <Icon name="plus" /> Megjegyzés
          </button>
        )}

        <div className="quick-foot">
          <span className="small muted">
            {periodName(periodId)} hónap · {shortDate(date)}
          </span>
          <button className="btn sm ghost" onClick={unexpected}>
            <Icon name="alert-triangle" /> Váratlan kiadás
          </button>
        </div>

        {/* A hüvelykujj magasságában: a számbillentyűzet (érintőképernyőn) és a mentés, a lap aljához tapadva. */}
        <div className="quick-pad">
          {coarse && (
            <div className="keypad" role="group" aria-label="Számbillentyűzet">
              {KEYS.map((k) => (
                <button
                  key={k}
                  className="key num"
                  aria-label={k === 'del' ? 'Utolsó számjegy törlése' : undefined}
                  disabled={pending}
                  onMouseDown={keepFocus}
                  onClick={() => press(k)}
                >
                  {k === 'del' ? <Icon name="backspace" /> : k}
                </button>
              ))}
            </div>
          )}
          {def && (
            <button
              className="btn primary quick-save"
              disabled={pending}
              aria-busy={pending}
              aria-keyshortcuts="Enter"
              onMouseDown={keepFocus}
              onClick={() => recordEnvelope(def)}
            >
              <Icon name="check" /> Rögzítés: {def.name}
            </button>
          )}
        </div>
      </div>
    </Sheet>
  );
}
