/**
 * Hash-alapú útvonalak (`#/rogzites/<kategóriaId>?gyors`). Az URL-ben él a képernyő, így működik a vissza
 * gesztus, a könyvjelző és a PWA-parancsikon.
 */
export type Screen = 'dashboard' | 'record' | 'planner' | 'analysis' | 'calendar' | 'categories' | 'settings';

export const SCREEN_PATH: Record<Screen, string> = {
  dashboard: 'attekintes',
  record: 'rogzites',
  planner: 'terv',
  analysis: 'elemzes',
  calendar: 'naptar',
  categories: 'kategoriak',
  settings: 'beallitasok',
};

export interface Route {
  screen: Screen;
  /** Fókusz a képernyőn belül: a Rögzítésen a kategória, a Kategóriákon pl. az új cél űrlapja. */
  focus: string | null;
  /** Nyitva van-e a gyorsrögzítő (`?gyors`). */
  quick: boolean;
}

const BY_PATH = new Map(Object.entries(SCREEN_PATH).map(([screen, path]) => [path, screen as Screen]));

/** Ismeretlen vagy üres útvonalnál az Áttekintés: a kezdőképernyő nem a legutóbb látott. */
export function parseRoute(hash: string): Route {
  const raw = hash.replace(/^#/, '');
  const q = raw.indexOf('?');
  const path = q < 0 ? raw : raw.slice(0, q);
  const query = q < 0 ? '' : raw.slice(q + 1);
  const [first = '', second] = path.split('/').filter(Boolean);
  const screen = BY_PATH.get(first.toLowerCase());
  let focus: string | null = null;
  if (screen && second) {
    try {
      focus = decodeURIComponent(second);
    } catch {
      // Hibás kódolású (pl. kézzel elgépelt) fókusz: a képernyő megnyílik, csak fókusz nélkül.
    }
  }
  return { screen: screen ?? 'dashboard', focus, quick: new URLSearchParams(query).has('gyors') };
}

export function formatRoute(r: Route): string {
  const focus = r.focus ? `/${encodeURIComponent(r.focus)}` : '';
  return `#/${SCREEN_PATH[r.screen]}${focus}${r.quick ? '?gyors' : ''}`;
}

export function sameRoute(a: Route, b: Route): boolean {
  return a.screen === b.screen && a.focus === b.focus && a.quick === b.quick;
}

/** A gyorsrögzítő alatti útvonal (az alsó lap az útvonalban nem látszik). */
export function baseRoute(r: Route): Route {
  return r.quick ? { ...r, quick: false } : r;
}

/**
 * Új előzménybejegyzés kell-e. Ugyanarra az útvonalra nem; egy réteg (gyorsrögzítő, alsó lap) bejegyzésének
 * pedig a helyére lépünk, hogy a vissza gesztus ne nyissa meg újra a már bezárt réteget. Ha a cél épp a réteg
 * alatti útvonal, elég visszalépni: a csere egy második, azonos bejegyzést hagyna, amelyen az első vissza lépés
 * látszólag nem csinál semmit. Ugyanez a helyzet, ha a rétegből cserét kérnek (ugyanazon a képernyőn, pl. csak
 * a fókusz más): ilyenkor a réteg alatti bejegyzést kell cserélni, vagyis visszalépni, és utána cserélni.
 */
export function historyMode(
  current: Route,
  next: Route,
  opts: { replace?: boolean; onLayer: boolean },
): 'push' | 'replace' | 'back' | 'backReplace' {
  if (opts.onLayer && sameRoute(baseRoute(current), next)) return 'back';
  if (opts.onLayer && opts.replace) return 'backReplace';
  return opts.replace || opts.onLayer || sameRoute(current, next) ? 'replace' : 'push';
}
