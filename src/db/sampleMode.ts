import type { SampleKind } from '../domain/sample';

/**
 * Csak fejlesztéskor: mintaadatos mód a design-felméréshez (DESIGN_TERV.md, 0. fázis). A `?minta=teljes`,
 * `?minta=szelso` vagy `?minta=ures` paraméter a mintát egy külön adatbázisba tölti, és a lap (fül) erre a
 * munkamenetre mintaadatos marad, újratöltés után is. A `?minta=ki` visszavált a valódi adatokra. A valódi
 * adatbázishoz, a UI-beállításokhoz és a szinkronhoz a mód nem nyúl (lásd localStore).
 */
export type SampleRequest = SampleKind | 'ures';

// Itt nem a mintagenerátorból jön, hogy az éles buildbe ne kerüljön bele.
const REQUESTS: readonly SampleRequest[] = ['teljes', 'szelso', 'ures'];

export const SAMPLE_DB_NAME = 'csaladi-koltsegvetes-minta';
const SESSION_KEY = 'minta';

function read(): { active: boolean; load: SampleRequest | null } {
  if (!import.meta.env.DEV || typeof window === 'undefined') return { active: false, load: null };
  const url = new URL(window.location.href);
  const param = url.searchParams.get('minta');
  try {
    if (param !== null) {
      url.searchParams.delete('minta');
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
      if (param === 'ki') {
        sessionStorage.removeItem(SESSION_KEY);
        return { active: false, load: null };
      }
      const load = param === '' ? 'teljes' : REQUESTS.find((r) => r === param) ?? null;
      if (load) {
        sessionStorage.setItem(SESSION_KEY, '1');
        return { active: true, load };
      }
    }
    return { active: sessionStorage.getItem(SESSION_KEY) === '1', load: null };
  } catch {
    return { active: false, load: null };
  }
}

export const SAMPLE = read();
