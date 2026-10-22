import { useId, useMemo, useRef, useState } from 'react';
import {
  coverAllowed, coverBalanceEffect, coverEffectText, coverError, coverMessage, coverNeed, coverPrefill, coverScopeText,
  coverSources, coverTargetText, type CoverSource,
} from '../../domain/flex';
import { formatFt, parseAmount } from '../../domain/money';
import { paceOverview } from '../../domain/pace';
import type { PeriodId } from '../../domain/types';
import { moveCover, undoMoveCover } from '../../db/repo';
import { useBudget, useToast } from '../context';
import { writeError } from '../errors';
import { CatIcon, Icon } from './common';
import { Sheet } from './Sheet';

// A lap neve a router memóriabeli rétegében: „fedezet|2026-10|<kategóriaId>”.
const PREFIX = 'fedezet|';

export const coverSheetName = (periodId: PeriodId, categoryId: string) => `${PREFIX}${periodId}|${categoryId}`;

export function parseCoverSheet(name: string | null): { periodId: PeriodId; categoryId: string } | null {
  if (!name?.startsWith(PREFIX)) return null;
  const rest = name.slice(PREFIX.length);
  const i = rest.indexOf('|');
  return i < 0 ? null : { periodId: rest.slice(0, i), categoryId: rest.slice(i + 1) };
}

/**
 * Ha a megnyitó gomb a művelettel eltűnt (a keret már nem kér fedezetet, vagy a teendő megszűnt), a fókusz
 * a Rögzítésen a keret sorára, az Áttekintésen a teendők címére kerül.
 */
const fallbackFocus = (categoryId: string) => () =>
  document.querySelector<HTMLElement>(`#cat-${CSS.escape(categoryId)} .rec-env-name`) ??
  document.getElementById('todos-title') ??
  document.getElementById('todos-ok');

/**
 * „Fedezet áthozása”: egy túlfutó keret terve egy másik keret maradékából nő, csak erre az időszakra (két
 * „csak erre a hónapra” tervmódosítás, egyetlen visszavonással). Nincs maradék-átvitel: a következő időszak
 * mindkét keretnél a korábbi tervvel folytatódik.
 */
export function CoverSheet({ periodId, categoryId, onClose }: { periodId: PeriodId; categoryId: string; onClose: () => void }) {
  const { data, summaries, today, go } = useBudget();
  const toast = useToast();
  const p = summaries.byId.get(periodId);
  const pace = useMemo(() => (p ? paceOverview(data.categories, p, today) : null), [data.categories, p, today]);
  const env = pace?.byId.get(categoryId);
  const target = env && p && coverAllowed(p, data.settings.firstPeriodId) && !env.cat.archived ? env : undefined;
  const sources = useMemo(() => (pace ? coverSources(pace, categoryId) : []), [pace, categoryId]);
  const need = target ? coverNeed(target) : 0;
  const prefill = (s: CoverSource | undefined) => {
    const v = s ? coverPrefill(need, s.left) : 0;
    return v > 0 ? String(v) : '';
  };

  const [sourceId, setSourceId] = useState<string | null>(null);
  const source = sources.find((s) => s.cat.id === sourceId) ?? sources[0];
  const [text, setText] = useState(() => prefill(source));
  const [error, setError] = useState('');
  // Folyamatban lévő mentés alatt a dupla Enter vagy kattintás ne hozza át kétszer.
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);
  const radioName = useId();
  const errorId = useId();
  const noteId = useId();
  const srcTitleId = useId();

  const amount = parseAmount(text);
  // Beírás közben látszik a hatás; érvénytelen összegnél nincs mit átrendezni.
  const effect = target && source && amount !== null && amount <= source.left ? coverBalanceEffect(target, source, amount) : 0;

  const fail = (msg: string) => {
    setError(msg);
    amountRef.current?.focus();
  };

  const submit = async () => {
    if (busy.current || !target || !source) return;
    if (amount === null) return fail(text.trim() ? 'Ez nem érvényes összeg' : 'Adj meg egy összeget');
    const err = coverError(amount, source);
    if (err) return fail(err);
    busy.current = true;
    setPending(true);
    try {
      const from = source.cat;
      const change = await moveCover(from, target.cat, periodId, amount);
      toast(coverMessage(from, target.cat, amount, periodId), () => undoMoveCover(change));
      onClose();
    } catch (e) {
      // A beírt összeg megmarad, hogy újra lehessen próbálni.
      console.error(e);
      toast(writeError(e), undefined, 'error');
    } finally {
      busy.current = false;
      setPending(false);
    }
  };

  return (
    <Sheet title="Fedezet áthozása" onClose={onClose} fallbackFocus={fallbackFocus(categoryId)}>
      {!target ? (
        <p className="small muted cover-empty">Ehhez a kerethez ebben az időszakban nem hozható át fedezet.</p>
      ) : (
        <form
          className="cover"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="cover-target">
            <CatIcon cat={target.cat} />
            <div className="cover-main">
              <div className="cover-name">{target.cat.name}</div>
              <div className={`small num ${target.pace === 'over' ? 'neg' : need > 0 ? 'warn-text' : 'muted'}`}>{coverTargetText(target)}</div>
            </div>
          </div>

          {sources.length === 0 ? (
            <div className="cover-empty">
              <p className="small muted">
                Egyik keretben sem maradt pénz ebben az időszakban. A keret tervét a Tervezőben emelheted.
              </p>
              <button type="button" className="sm" onClick={() => go('planner')}>
                Tervező <Icon name="chevron-right" />
              </button>
            </div>
          ) : (
            <>
              <fieldset className="cover-src" aria-labelledby={srcTitleId}>
                <div id={srcTitleId} className="quick-title">Melyik keretből?</div>
                {sources.map((s) => {
                  const on = s.cat.id === source?.cat.id;
                  return (
                    <label key={s.cat.id} className={`cover-opt ${on ? 'on' : ''}`}>
                      <input
                        type="radio"
                        name={radioName}
                        checked={on}
                        autoFocus={on}
                        disabled={pending}
                        onChange={() => {
                          setSourceId(s.cat.id);
                          setText(prefill(s));
                          setError('');
                        }}
                      />
                      <CatIcon cat={s.cat} />
                      <span className="cover-opt-name">{s.cat.name}</span>
                      <span className="small muted num">maradt {formatFt(s.left)}</span>
                    </label>
                  );
                })}
              </fieldset>

              <div>
                <div className="cover-amount">
                  <input
                    ref={amountRef}
                    type="text"
                    inputMode="decimal"
                    className="num"
                    placeholder="Összeg"
                    aria-label={`Áthozott összeg ${target.cat.name} keretnek`}
                    aria-invalid={!!error}
                    aria-describedby={error ? `${errorId} ${noteId}` : noteId}
                    value={text}
                    disabled={pending}
                    onChange={(e) => {
                      setText(e.target.value);
                      setError('');
                    }}
                  />
                  <span className="muted">Ft</span>
                  <button type="submit" className="primary" disabled={pending} aria-busy={pending}>
                    <Icon name="arrows-exchange" /> Áthozás
                  </button>
                </div>
                {error && (
                  <div id={errorId} className="error" role="alert">
                    {error}
                  </div>
                )}
              </div>

              <div id={noteId} className="cover-note small">
                <Icon name="info-circle" />
                <span>
                  {coverEffectText(effect, source.cat.name)} <span className="muted">{coverScopeText(periodId)}</span>
                </span>
              </div>
            </>
          )}
        </form>
      )}
    </Sheet>
  );
}
