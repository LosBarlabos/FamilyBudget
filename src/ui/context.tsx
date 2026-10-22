import Dexie from 'dexie';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Summaries } from '../domain/balance';
import type { PeriodConfig } from '../domain/periods';
import type { Screen } from '../domain/routes';
import type { BudgetData, ISODate, PeriodId } from '../domain/types';
import { errorText, writeError } from './errors';

export type { Screen };

/**
 * A Kategóriák képernyőn az új célt felvevő űrlapot nyitja meg (a go() fókusz-paramétereként). Az URL-ben is
 * látszik (`#/kategoriak/uj-cel`); kategória-azonosítóval (UUID) nem ütközhet.
 */
export const NEW_GOAL = 'uj-cel';

/** A Rögzítésen a Váratlan kiadás panelt nyitja meg (`#/rogzites/varatlan`), pl. a gyorsrögzítőből. */
export const UNEXPECTED_PANEL = 'varatlan';

export interface BudgetCtx {
  data: BudgetData;
  summaries: Summaries;
  cfg: PeriodConfig;
  today: ISODate;
  periodId: PeriodId;
  setPeriodId: (id: PeriodId) => void;
  /** Képernyőváltás új előzménybejegyzéssel (ugyanazon a képernyőn a bejegyzés cseréjével). */
  go: (screen: Screen, focusCategoryId?: string) => void;
  /** A gyorsrögzítő megnyitása (mint a + gomb). */
  openQuick: () => void;
  /** A „Fedezet áthozása” lap megnyitása a kiválasztott időszakban, a megadott kerethez. */
  openCover: (categoryId: string) => void;
  focusCategoryId: string | null;
  /** A fókusz törlése az URL-ből, hogy a vissza lépés és az újratöltés ne alkalmazza újra. */
  clearFocus: () => void;
}

const Ctx = createContext<BudgetCtx | null>(null);
export const BudgetProvider = Ctx.Provider;

export function useBudget(): BudgetCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useBudget csak BudgetProvideren belül használható');
  return v;
}

// --- Értesítés visszavonással ----------------------------------------------

type Undo = () => void | Promise<void>;
type Tone = 'info' | 'error';

interface ToastMsg {
  id: number;
  text: string;
  undo?: Undo;
  tone: Tone;
}

export type ToastFn = (text: string, undo?: Undo, tone?: Tone) => void;

const ToastCtx = createContext<ToastFn>(() => {});

export function useToast() {
  return useContext(ToastCtx);
}

/**
 * Egyszerre ennyi értesítés látszik. A többi sorban áll, és akkor jelenik meg (és indul az ideje), amikor
 * hely szabadul fel, hogy egyik visszavonása se vesszen el.
 */
const MAX_TOASTS = 3;

const toastDuration = (m: ToastMsg) => (m.tone === 'error' ? 9000 : m.undo ? 7000 : 3500);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<ToastMsg[]>([]);
  const timers = useRef(new Map<number, number>());
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => {
    window.clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setList((l) => l.filter((m) => m.id !== id));
  }, []);

  const show = useCallback<ToastFn>((text, undo, tone = 'info') => {
    const id = ++seq.current;
    setList((l) => [...l, { id, text, undo, tone }]);
  }, []);

  const visible = list.slice(0, MAX_TOASTS);
  const waiting = list.length - visible.length;

  // Az időzítő csak a látható értesítéseknél indul, a sorban állók a megjelenésükkor kapják meg.
  useEffect(() => {
    for (const m of list.slice(0, MAX_TOASTS)) {
      if (!timers.current.has(m.id)) timers.current.set(m.id, window.setTimeout(() => dismiss(m.id), toastDuration(m)));
    }
  }, [list, dismiss]);

  useEffect(() => {
    const t = timers.current;
    return () => {
      t.forEach((h) => window.clearTimeout(h));
      t.clear();
    };
  }, []);

  // Védőháló: az el nem kapott adatbázishiba se maradjon csendben.
  useEffect(() => {
    const h = (ev: PromiseRejectionEvent) => {
      if (ev.reason instanceof Dexie.DexieError) show(writeError(ev.reason), undefined, 'error');
    };
    window.addEventListener('unhandledrejection', h);
    return () => window.removeEventListener('unhandledrejection', h);
  }, [show]);

  const runUndo = async (m: ToastMsg) => {
    dismiss(m.id);
    try {
      await m.undo?.();
    } catch (e) {
      console.error(e);
      show(`Nem sikerült visszavonni: ${errorText(e)}`, undefined, 'error');
    }
  };

  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div className="toasts" aria-live="polite">
        {visible.map((m) => (
          <div key={m.id} className={`toast ${m.tone === 'error' ? 'error' : ''}`} role={m.tone === 'error' ? 'alert' : undefined}>
            <span>{m.text}</span>
            {m.undo ? (
              <button className="sm" onClick={() => runUndo(m)}>
                Visszavonás
              </button>
            ) : (
              <button className="sm ghost icon" aria-label="Értesítés bezárása" onClick={() => dismiss(m.id)}>
                <i className="ti ti-x" aria-hidden="true" />
              </button>
            )}
          </div>
        ))}
        {waiting > 0 && <div className="toast-more tiny">még {waiting} értesítés</div>}
      </div>
    </ToastCtx.Provider>
  );
}

/**
 * Egységes hibakezelés az írásokhoz: a hibát „Nem sikerült menteni: …” toastként mutatja, és undefined-ot ad.
 * Használat: onClick={() => safe(async () => { … })}.
 */
export function useSafe() {
  const toast = useToast();
  return useCallback(
    async <T,>(fn: () => Promise<T> | T): Promise<T | undefined> => {
      try {
        return await fn();
      } catch (e) {
        console.error(e);
        toast(writeError(e), undefined, 'error');
        return undefined;
      }
    },
    [toast],
  );
}
