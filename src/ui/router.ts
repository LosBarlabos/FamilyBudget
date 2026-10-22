import { useCallback, useEffect, useRef, useState } from 'react';
import { baseRoute, formatRoute, historyMode, parseRoute, sameRoute, type Route } from '../domain/routes';

/**
 * Egy réteg (gyorsrögzítő, alsó lap) saját előzménybejegyzése: a vissza gesztus ezt zárja be, ahelyett hogy
 * elhagyná a képernyőt (telepített appban magát az appot).
 */
const LAYER = { layer: true } as const;
const onLayerEntry = () => (window.history.state as { layer?: boolean } | null)?.layer === true;

export interface Router {
  route: Route;
  /** Memóriabeli alsó lap (pl. 'more'); bármelyik vissza lépés bezárja. */
  sheet: string | null;
  navigate: (next: Route, replace?: boolean) => void;
  openQuick: () => void;
  openSheet: (name: string) => void;
  /** A gyorsrögzítő vagy az alsó lap bezárása. */
  closeLayer: () => void;
  /** A képernyőn belüli fókusz törlése az URL-ből (a bejegyzés cseréjével, a réteg megmarad). */
  clearFocus: () => void;
}

export function useRouter(): Router {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  const [sheet, setSheet] = useState<string | null>(null);
  // A history.back() aszinkron: amíg a popstate meg nem jön, egy újabb bezárás ne lépjen vissza még egyet.
  const backPending = useRef(false);
  // A visszalépés után erre az útvonalra cserél (a réteg alatti bejegyzés helyére, lásd historyMode).
  const afterBack = useRef<Route | null>(null);

  const show = useCallback((next: Route) => setRoute((r) => (sameRoute(r, next) ? r : next)), []);

  useEffect(() => {
    const sync = () => {
      backPending.current = false;
      setSheet(null);
      const next = afterBack.current;
      afterBack.current = null;
      if (next) window.history.replaceState(null, '', formatRoute(next));
      show(next ?? parseRoute(window.location.hash));
    };
    window.addEventListener('popstate', sync);
    window.addEventListener('hashchange', sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('hashchange', sync);
    };
  }, [show]);

  // Közvetlen hivatkozással (pl. PWA-parancsikonnal) nyitott gyorsrögzítő: alá kerül egy bejegyzés a réteg
  // nélküli útvonallal, ő maga pedig a sajátját kapja, így a vissza gesztus a panelt zárja be, nem az appot.
  useEffect(() => {
    const r = parseRoute(window.location.hash);
    if (!r.quick || onLayerEntry()) return;
    window.history.replaceState(null, '', formatRoute(baseRoute(r)));
    window.history.pushState(LAYER, '', formatRoute(r));
  }, []);

  const write = useCallback(
    (next: Route, push: boolean, layer: boolean) => {
      const state = layer ? LAYER : null;
      if (push) window.history.pushState(state, '', formatRoute(next));
      else window.history.replaceState(state, '', formatRoute(next));
      show(next);
    },
    [show],
  );

  const closeLayer = useCallback(() => {
    if (backPending.current) return;
    if (onLayerEntry()) {
      backPending.current = true;
      window.history.back();
      return;
    }
    // Saját bejegyzés nélkül nyílt (pl. a címsorba írt ?gyors): a visszalépés egy másik képernyőre vinne, így
    // csak a ?gyors tűnik el.
    setSheet(null);
    if (route.quick) write(baseRoute(route), false, false);
  }, [route, write]);

  const navigate = useCallback(
    (next: Route, replace = false) => {
      // A ?gyors-os bejegyzés saját jelző nélkül is a gyorsrögzítőé: a helyére kell lépni, különben a vissza
      // lépés újra megnyitná a panelt.
      const mode = historyMode(route, next, { replace, onLayer: onLayerEntry() || route.quick });
      if (mode === 'back') return closeLayer();
      if (mode === 'backReplace' && onLayerEntry()) {
        if (backPending.current) return;
        backPending.current = true;
        afterBack.current = next;
        window.history.back();
        return;
      }
      setSheet(null);
      write(next, mode === 'push', false);
    },
    [route, write, closeLayer],
  );

  const openQuick = useCallback(() => {
    if (route.quick) return;
    setSheet(null);
    const next = { ...route, quick: true };
    write(next, historyMode(route, next, { onLayer: onLayerEntry() }) === 'push', true);
  }, [route, write]);

  const openSheet = useCallback((name: string) => {
    if (!onLayerEntry()) window.history.pushState(LAYER, '');
    setSheet(name);
  }, []);

  // Az URL-ből olvas, nem a route-ból: így stabil, és egy még meg nem jelenített útvonalváltás után is a valódi
  // bejegyzést írja át.
  const clearFocus = useCallback(() => {
    const r = parseRoute(window.location.hash);
    if (!r.focus) return;
    const next = { ...r, focus: null };
    window.history.replaceState(window.history.state, '', formatRoute(next));
    show(next);
  }, [show]);

  return { route, sheet, navigate, openQuick, openSheet, closeLayer, clearFocus };
}
