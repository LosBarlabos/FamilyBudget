/** Az adatbázis- és böngészőhibák neve helyett érthető magyar ok. */
const KNOWN: Record<string, string> = {
  QuotaExceededError: 'elfogyott a böngésző tárhelye',
  DatabaseClosedError: 'az adatbázis bezárult, töltsd újra az oldalt',
  InvalidStateError: 'az adatbázis nem érhető el, töltsd újra az oldalt',
  VersionError: 'az adatbázis újabb verziójú, töltsd újra az oldalt',
  ConstraintError: 'ütköző adat',
  OpenFailedError: 'az adatbázis nem nyitható meg',
};

/** Rövid, magyar hibaszöveg a toastokhoz. */
export function errorText(e: unknown): string {
  if (e instanceof Error || (typeof e === 'object' && e !== null && 'name' in e)) {
    const err = e as { name?: string; message?: string; inner?: { name?: string } };
    const known = KNOWN[err.inner?.name ?? ''] ?? KNOWN[err.name ?? ''];
    if (known) return known;
    if (err.message) return err.message;
  }
  if (typeof e === 'string' && e) return e;
  return 'ismeretlen hiba';
}

export const writeError = (e: unknown) => `Nem sikerült menteni: ${errorText(e)}`;
