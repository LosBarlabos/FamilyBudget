/**
 * Áttetsző változat egy hexa színből (a tokenek és a kategóriaszínek hexában vannak, lásd 05-design-rendszer.md).
 * A #rgb és a #rrggbb alakot is kezeli; más alaknál a színt változatlanul adja vissza.
 */
export function withAlpha(color: string, alpha: number): string {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return color;
  const hex = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
  return `#${hex}${Math.round(Math.min(1, Math.max(0, alpha)) * 255).toString(16).padStart(2, '0')}`;
}
