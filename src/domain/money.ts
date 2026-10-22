const ft = new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 0, useGrouping: 'always' });

/** '1 234 567 Ft', negatívnál '-1 234 Ft'. */
export function formatFt(n: number): string {
  const r = Math.round(n);
  return `${r < 0 ? '-' : ''}${ft.format(Math.abs(r))}\u00a0Ft`;
}

export function formatSigned(n: number): string {
  return n > 0 ? `+${formatFt(n)}` : formatFt(n);
}

/** Tengelyfeliratokhoz: '450e', '1,2M'. */
export function formatShort(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (a >= 1_000_000) return `${sign}${(a / 1_000_000).toFixed(1).replace('.', ',').replace(',0', '')}M`;
  if (a >= 1000) return `${sign}${Math.round(a / 1000)}e`;
  return `${sign}${Math.round(a)}`;
}

/**
 * Felhasználói összeg értelmezése: szóközök nélkül, 'e' utótaggal ezer ('12e' = 12 000).
 * A pont csak akkor ezres elválasztó, ha pontosan 3 számjegy követi ('1.234.567'); különben tizedesjel,
 * ahogy a vessző is ('12.5e' = '12,5e' = 12 500).
 * Érvénytelen vagy nem pozitív bemenetnél null.
 */
export function parseAmount(input: string): number | null {
  const s = input
    .trim()
    .toLowerCase()
    .replace(/\s/g, '')
    .replace(/ft$/, '')
    .replace(/\.(?=\d{3}(?!\d))/g, '');
  const m = /^(\d+(?:[.,]\d+)?)(e)?$/.exec(s);
  if (!m) return null;
  const n = Number(m[1].replace(',', '.')) * (m[2] ? 1000 : 1);
  const r = Math.round(n);
  return r > 0 ? r : null;
}

/**
 * Előjeles összeg (pl. nyitó egyenleg): a '-' vagy '−' előjel negatívat jelent, a '0' nullát.
 * Üres vagy érvénytelen bemenetnél null.
 */
export function parseSignedAmount(input: string): number | null {
  const t = input.trim();
  if (/^[-−]?\s*0+$/.test(t)) return 0;
  const neg = /^[-−]/.test(t);
  const v = parseAmount(neg ? t.slice(1) : t);
  return v === null ? null : neg ? -v : v;
}
