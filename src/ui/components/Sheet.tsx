import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { Icon } from './common';

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

/**
 * Az app saját rétege: kompakt elrendezésben alsó lap fogantyúval, egyébként középre igazított panel. A fix alsó sáv fölött van, nem
 * abban, és a képernyő-billentyűzet fölé emelkedik, így egyik sem takarja el. A toastok fölötte maradnak.
 */
export function Sheet({
  title, onClose, children, fallbackFocus,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  /** Bezáráskor ide kerül a fókusz, ha a megnyitó gomb közben eltűnt (pl. a teendő a művelettel megszűnt). */
  fallbackFocus?: () => HTMLElement | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const fallback = useRef(fallbackFocus);
  useEffect(() => {
    fallback.current = fallbackFocus;
  });
  const titleId = useId();
  // Még a mezők automatikus fókusza előtt: ide kerül vissza a fókusz bezáráskor.
  const [opener] = useState(() => (document.activeElement instanceof HTMLElement ? document.activeElement : null));
  const downOnLayer = useRef(false);
  // Fogantyú (csak alsó lapként látszik): lefelé húzva követi az ujjat, és a lap negyedénél (legfeljebb 120 px)
  // tovább húzva bezárja; rövidebb húzásnál visszaugrik.
  const drag = useRef<{ y: number; dy: number } | null>(null);
  const onHandleDown = (e: PointerEvent<HTMLDivElement>) => {
    drag.current = { y: e.clientY, dy: 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
    ref.current!.classList.remove('settling');
    ref.current!.classList.add('dragging');
  };
  const onHandleMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current.dy = Math.max(0, e.clientY - drag.current.y);
    ref.current!.style.transform = `translateY(${drag.current.dy}px)`;
  };
  const onHandleUp = () => {
    const d = drag.current;
    drag.current = null;
    const el = ref.current!;
    el.classList.remove('dragging');
    if (d && d.dy > Math.min(120, el.offsetHeight / 4)) return onClose();
    el.classList.add('settling');
    el.style.transform = '';
  };

  useEffect(() => {
    const el = ref.current!;
    if (!el.contains(document.activeElement)) el.focus({ preventScroll: true });
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // A fix elemek a teljes ablakhoz igazodnak; a billentyűzet ennyit takar el alulról.
    const vv = window.visualViewport;
    const fit = () => {
      if (vv) el.style.setProperty('--kb', `${Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))}px`);
    };
    fit();
    vv?.addEventListener('resize', fit);
    vv?.addEventListener('scroll', fit);
    return () => {
      vv?.removeEventListener('resize', fit);
      vv?.removeEventListener('scroll', fit);
      document.body.style.overflow = overflow;
      // A StrictMode próba-lebontásakor az elem a helyén marad; ott nem szabad elvenni a fókuszt.
      // Billentyűvel (pl. N) nyitva nincs megnyitó elem, csak a body: ilyenkor a tartalék kapja a fókuszt.
      const back = opener && opener !== document.body && opener.isConnected ? opener : fallback.current?.();
      if (!el.isConnected) back?.focus({ preventScroll: true });
    };
  }, [opener]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab') return;
    // A fókusz a rétegen belül marad.
    const items = [...ref.current!.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === ref.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className="sheet-layer"
      // Csak a háttéren kezdett és végzett kattintás zár be (a mezőből kihúzott kijelölés nem).
      onPointerDown={(e) => (downOnLayer.current = e.target === e.currentTarget)}
      onClick={(e) => downOnLayer.current && e.target === e.currentTarget && onClose()}
    >
      <div ref={ref} className="sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onKeyDown={onKeyDown}>
        <div
          className="sheet-handle"
          aria-hidden="true"
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleUp}
        />
        <div className="sheet-head">
          <h2 id={titleId}>{title}</h2>
          <button className="btn ghost icon" aria-label="Bezárás" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
