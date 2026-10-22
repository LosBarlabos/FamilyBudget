import type { Category } from './types';

/** Megjelenítési egység: egy csoport a kategóriáival, vagy egy csoport nélküli kategória. */
export interface Unit {
  key: string;
  name: string;
  color: string;
  icon: string;
  categories: Category[];
}

/** A kategóriák sorrendjében; a csoport az első kategóriájának helyén jelenik meg. */
export function displayUnits(cats: Category[]): Unit[] {
  const units: Unit[] = [];
  const byGroup = new Map<string, Unit>();
  for (const c of [...cats].sort((a, b) => a.order - b.order)) {
    if (c.group) {
      const u = byGroup.get(c.group);
      if (u) {
        u.categories.push(c);
        continue;
      }
      const nu: Unit = { key: `g:${c.group}`, name: c.group, color: c.color, icon: c.icon, categories: [c] };
      byGroup.set(c.group, nu);
      units.push(nu);
    } else {
      units.push({ key: `c:${c.id}`, name: c.name, color: c.color, icon: c.icon, categories: [c] });
    }
  }
  return units;
}
