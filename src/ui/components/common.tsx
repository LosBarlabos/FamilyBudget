import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { parseAmount } from '../../domain/money';
import type { Pace } from '../../domain/pace';
import { barPercent } from '../../domain/status';
import type { Category } from '../../domain/types';
import { useToast } from '../context';
import { writeError } from '../errors';
import { readLocal, subscribeLocal, writeLocal } from '../localStore';

/** A megjegyzésmezők közös javaslatlistája (#címkék); az App tölti fel. */
export const NOTE_TAGS_LIST = 'note-tags';

export function Icon({ name, style, className = '' }: { name: string; style?: CSSProperties; className?: string }) {
  return <i className={`ti ti-${name} ${className}`} style={style} aria-hidden="true" />;
}

export function CatIcon({ cat }: { cat: Pick<Category, 'icon' | 'color'> }) {
  return (
    <span className="cat-icon" style={{ background: `${cat.color}1f`, color: cat.color }}>
      <Icon name={cat.icon} />
    </span>
  );
}

export type BarTone = 'neutral' | 'accent' | 'warn' | 'over' | 'good' | 'plan';

const TONE: Record<BarTone, string> = {
  neutral: 'var(--color-text-subtle)',
  accent: 'var(--color-accent)',
  warn: 'var(--color-warn-fill)',
  over: 'var(--color-danger-fill)',
  good: 'var(--color-ok)',
  plan: 'var(--color-border-strong)',
};

/** A keretsáv színe a tempót követi: rendben semleges akcentszín, gyors fogyás borostyán, túllépés piros. */
export const PACE_TONE: Record<Pace, BarTone> = { ok: 'accent', fast: 'warn', over: 'over' };

/** A marker (0–1) a „ma” jelölő helye: az időszakból eddig eltelt idő aránya. */
export function Bar({ value, max, tone, color, marker }: { value: number; max: number; tone?: BarTone; color?: string; marker?: number | null }) {
  const pct = barPercent(value, max);
  const bar = (
    <div className="bar" role="presentation">
      <div style={{ width: `${pct}%`, background: color ?? TONE[tone ?? 'accent'] }} />
    </div>
  );
  if (marker === undefined || marker === null) return bar;
  return (
    <div className="bar-wrap">
      {bar}
      <span className="bar-today" style={{ left: `${Math.min(100, Math.max(0, marker * 100))}%` }} title="Ma" aria-hidden="true" />
    </div>
  );
}

export function Kpi({ label, value, sub, valueClass }: { label: string; value: ReactNode; sub?: ReactNode; valueClass?: string }) {
  return (
    <div className="kpi">
      <div className="label">{label}</div>
      <div className={`value num ${valueClass ?? ''}`}>{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

/**
 * Összegbeviteli mező: Enterre vagy a gombra rögzít, érvénytelen összegnél hibát jelez és nem rögzít.
 * Elfogadja a '12 000', '12.000' és '12e' formákat.
 */
export function AmountInput({
  onSubmit,
  placeholder = 'Összeg',
  buttonLabel = 'Rögzít',
  initial = '',
  autoFocus,
  allowZero,
  width = 130,
  onCancel,
  withNote,
  noteToggle,
  ariaLabel,
  validate,
}: {
  /** További ellenőrzés; hibaüzenetet ad vissza, ha az összeg nem rögzíthető. */
  validate?: (amount: number) => string | null;
  onSubmit: (amount: number, note?: string) => void | Promise<void>;
  withNote?: boolean;
  /** A megjegyzés mező csak a „Megjegyzés” kapcsolóra jelenik meg (helytakarékos változat). */
  noteToggle?: boolean;
  /** Az összegmező akadálymentes neve; alapból a helyőrző szövege. */
  ariaLabel?: string;
  placeholder?: string;
  buttonLabel?: string;
  initial?: string;
  autoFocus?: boolean;
  allowZero?: boolean;
  width?: number;
  onCancel?: () => void;
}) {
  const [text, setText] = useState(initial);
  const [note, setNote] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);
  const [error, setError] = useState('');
  const errorId = useId();
  // Folyamatban lévő mentés alatt a dupla Enter vagy kattintás ne rögzítsen kétszer.
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const toast = useToast();
  const amountRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLInputElement>(null);

  useEffect(() => setText(initial), [initial]);

  const submit = async () => {
    if (busy.current) return;
    const v = allowZero && text.trim() === '0' ? 0 : parseAmount(text);
    if (v === null) {
      setError(text.trim() ? 'Ez nem érvényes összeg' : 'Adj meg egy összeget');
      return;
    }
    const custom = validate?.(v);
    if (custom) {
      setError(custom);
      return;
    }
    busy.current = true;
    setPending(true);
    try {
      await onSubmit(v, note.trim() || undefined);
      // A kapcsolós megjegyzés mező bezárul: ha épp abban volt a fókusz, az összegmezőre kerül, ne a lapra.
      if (noteToggle && document.activeElement === noteRef.current) amountRef.current?.focus();
      setText('');
      setNote('');
      setNoteOpen(false);
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
    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          ref={amountRef}
          type="text"
          inputMode="numeric"
          className="sm num"
          style={{ width }}
          placeholder={placeholder}
          value={text}
          autoFocus={autoFocus}
          // A Rögzítés ez alapján adja a fókuszt a kategóriára irányított sor összegmezőjének.
          data-amount=""
          aria-label={ariaLabel ?? placeholder}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
          onChange={(e) => {
            setText(e.target.value);
            setError('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
            if (e.key === 'Escape') onCancel?.();
          }}
        />
        {(withNote || (noteToggle && noteOpen)) && (
          <input
            ref={noteRef}
            list={NOTE_TAGS_LIST}
            type="text"
            className="sm"
            style={{ width: 150 }}
            placeholder="Megjegyzés"
            aria-label="Megjegyzés (nem kötelező)"
            value={note}
            autoFocus={noteToggle}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
        )}
        <button className="btn sm" onClick={submit} disabled={pending} aria-busy={pending}>{buttonLabel}</button>
        {noteToggle && !noteOpen && (
          <button className="btn sm ghost" onClick={() => setNoteOpen(true)}>
            <Icon name="plus" /> Megjegyzés
          </button>
        )}
        {onCancel && (
          <button className="btn sm ghost icon" aria-label="Mégse" onClick={onCancel}>
            <Icon name="x" />
          </button>
        )}
      </div>
      {error && <span id={errorId} className="error">{error}</span>}
    </div>
  );
}

export interface MenuItem {
  label: string;
  icon?: string;
  onSelect: () => void;
}

/**
 * „⋯” gomb egy kis legördülő menüvel a ritkább műveletekhez. Esc vagy kattintás máshová bezárja; a nyilakkal
 * lehet a pontok között lépni.
 */
export function MenuButton({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    wrap.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const away = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (!open) return;
    if (e.key === 'Escape') {
      // Csak a menü zárul be, a körülötte lévő réteg (pl. alsó lap) nem.
      e.stopPropagation();
      setOpen(false);
      button.current?.focus();
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const list = [...(wrap.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const i = list.indexOf(document.activeElement as HTMLElement);
    list[(i + (e.key === 'ArrowDown' ? 1 : list.length - 1)) % list.length]?.focus();
  };

  return (
    <div
      className="menu-wrap"
      ref={wrap}
      onKeyDown={onKeyDown}
      // A lenyomás ne mozgassa a fókuszt: a Safari ilyenkor elveszi a menüponttól (a blur relatedTarget-je null),
      // és a menü még a kattintás előtt bezárulna.
      onMouseDown={(e) => e.preventDefault()}
      // A menüből kilépő fókusz (Tab) bezárja.
      onBlur={(e) => open && !wrap.current?.contains(e.relatedTarget as Node | null) && setOpen(false)}
    >
      <button
        ref={button}
        className="btn sm ghost icon"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => {
          // Bezáráskor a fókusz a gombra kerül, ne vesszen el a megszűnő menüponttal.
          if (open) button.current?.focus();
          setOpen(!open);
        }}
      >
        <Icon name="dots" />
      </button>
      {open && (
        <div id={menuId} className="menu" role="menu" aria-label={label}>
          {items.map((it) => (
            <button className="btn"
              key={it.label}
              role="menuitem"
              onClick={() => {
                setOpen(false);
                button.current?.focus();
                it.onSelect();
              }}
            >
              {it.icon && <Icon name={it.icon} />} {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Egy kattintásos lezárás („Kifizetve”, „Megérkezett”); a mentés idejére letiltva, hogy dupla kattintás ne rögzítsen kétszer. */
export function SettleButton({
  label, onClick, ariaLabel, primary = false,
}: { label: string; onClick: () => Promise<unknown>; ariaLabel?: string; primary?: boolean }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      className={`btn sm ${primary ? 'primary' : 'success'}`}
      disabled={busy}
      aria-busy={busy}
      aria-label={ariaLabel}
      onClick={async () => {
        if (busy) return;
        setBusy(true);
        try {
          await onClick();
        } finally {
          setBusy(false);
        }
      }}
    >
      <Icon name="check" /> {label}
    </button>
  );
}

export function Delta({
  pct, goodWhenUp = false, title = 'Változás az előző hónaphoz képest',
}: { pct: number | null; goodWhenUp?: boolean; title?: string }) {
  if (pct === null || Math.abs(pct) < 3) return null;
  return (
    <span className={`delta ${pct > 0 ? 'up' : 'down'} ${goodWhenUp ? 'good' : ''}`} title={title}>
      {pct > 0 ? '+' : ''}
      {pct}%
    </span>
  );
}

export function useColorScheme(): 'light' | 'dark' {
  const q = '(prefers-color-scheme: dark)';
  const [dark, setDark] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const h = () => setDark(m.matches);
    m.addEventListener('change', h);
    return () => m.removeEventListener('change', h);
  }, []);
  return dark ? 'dark' : 'light';
}

export function downloadFile(name: string, content: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * UI-kényelmi állapot (pl. összecsukott csoportok) a böngésző localStorage-ában; hiba esetén csak memóriában.
 * A beállító függvényt is elfogad (mint a setState), hogy egy később lefutó visszavonás ne régi listát írjon
 * vissza; a tárolót akkor is írja, ha a komponens közben lecsatolódott.
 */
export function useLocalState<T>(key: string, initial: T): [T, (v: T | ((prev: T) => T)) => void] {
  const v = useSyncExternalStore(
    useCallback((f: () => void) => subscribeLocal(key, f), [key]),
    () => readLocal(key, initial),
  );
  const set = (nv: T | ((prev: T) => T)) => writeLocal(key, initial, nv);
  return [v, set];
}

/**
 * Egymást kizáró választás gombsorként, rádiócsoport szemantikával: a kiválasztott elem felolvasható, a csoportba
 * egy Tab-lépéssel lehet belépni, és a nyílbillentyűk váltanak (WAI-ARIA rádiócsoport minta).
 */
export function Segmented<T extends string>({ label, options, value, onChange }: {
  label: string;
  options: readonly { id: T; label: ReactNode }[];
  value: T;
  onChange: (id: T) => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (i + step + options.length) % options.length;
    onChange(options[next].id);
    refs.current[next]?.focus();
  };
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o, i) => (
        <button
          key={o.id}
          ref={(el) => {
            refs.current[i] = el;
          }}
          role="radio"
          aria-checked={value === o.id}
          tabIndex={value === o.id ? 0 : -1}
          className={value === o.id ? 'on' : ''}
          onClick={() => onChange(o.id)}
          onKeyDown={(e) => onKeyDown(e, i)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Űrlapmezők hibáinak bekötése: a hibás mező `aria-invalid` és a hibaszövegre mutató `aria-describedby`
 * jelzést kap, a hibaszöveg `role="alert"`, így a képernyőolvasó is bejelenti. A `check` beállítja a hibákat,
 * és ha van, az első hibás mezőre viszi a fókuszt; igazat ad, ha nincs hiba.
 */
export function useFieldErrors<K extends string>() {
  const base = useId();
  const [errors, setErrors] = useState<Partial<Record<K, string>>>({});
  // Az első hibás mező a megjelenítés után kap fókuszt (amikor az aria-describedby már a helyén van).
  const [focusKey, setFocusKey] = useState<{ k: K } | null>(null);
  const idOf = (k: K) => `${base}-${k}`;
  useEffect(() => {
    if (focusKey) document.querySelector<HTMLElement>(`[aria-describedby="${base}-${focusKey.k}"]`)?.focus();
  }, [focusKey, base]);
  const field = (k: K) => ({
    'aria-invalid': errors[k] ? true : undefined,
    'aria-describedby': errors[k] ? idOf(k) : undefined,
  });
  const message = (k: K) =>
    errors[k] ? (
      <span className="error" id={idOf(k)} role="alert">
        {errors[k]}
      </span>
    ) : null;
  const check = (next: Partial<Record<K, string>>) => {
    setErrors(next);
    const first = (Object.keys(next) as K[]).find((k) => next[k]);
    if (first) setFocusKey({ k: first });
    return !first;
  };
  return { field, message, check };
}
