// UI-kényelmi beállítások (pl. összecsukott csoportok) a localStorage-ban, modulszintű tárral: az írás akkor is
// érvényesül, ha a beállító komponens közben lecsatolódott (pl. egy később megnyomott toast-visszavonás), és
// minden ugyanazt a kulcsot olvasó komponens frissül. Ha a localStorage nem érhető el, csak memóriában él.

const cache = new Map<string, unknown>();
const subs = new Map<string, Set<() => void>>();

export function readLocal<T>(key: string, initial: T): T {
  if (cache.has(key)) return cache.get(key) as T;
  let v = initial;
  try {
    const s = localStorage.getItem(key);
    if (s) v = JSON.parse(s) as T;
  } catch {
    /* nem kritikus */
  }
  cache.set(key, v);
  return v;
}

/** A beállító függvényt is elfogad (mint a setState): mindig a legfrissebb értékből számol. */
export function writeLocal<T>(key: string, initial: T, nv: T | ((prev: T) => T)) {
  const next = typeof nv === 'function' ? (nv as (prev: T) => T)(readLocal(key, initial)) : nv;
  cache.set(key, next);
  try {
    localStorage.setItem(key, JSON.stringify(next));
  } catch {
    /* nem kritikus */
  }
  subs.get(key)?.forEach((f) => f());
}

export function subscribeLocal(key: string, f: () => void) {
  let set = subs.get(key);
  if (!set) subs.set(key, (set = new Set()));
  set.add(f);
  return () => {
    set.delete(f);
  };
}

/** Csak a tesztekhez: a memóriabeli tár ürítése. */
export function resetLocalCache() {
  cache.clear();
}
