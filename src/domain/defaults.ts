import type { Category, CategoryType } from './types';

/** Kategorikus paletta, rögzített sorrendben. */
export const PALETTE = [
  '#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948',
  '#0f8a8a', '#8a5a2b', '#888780', '#a05195', '#4f6d8a',
];

export const ICONS = [
  'cash', 'coin', 'gift', 'home', 'building', 'key', 'shield', 'bolt', 'flame', 'droplet',
  'device-mobile', 'wifi', 'shopping-cart', 'basket', 'tools-kitchen-2', 'car', 'gas-station', 'bus',
  'mood-kid', 'school', 'heart', 'pill', 'shirt', 'movie', 'plane', 'ball-football', 'paw',
  'tool', 'receipt', 'dots', 'pig-money', 'beach', 'christmas-tree', 'credit-card', 'alert-triangle', 'car-crash',
];

type Template = [name: string, icon: string, type: CategoryType, color: string, group?: string, extra?: Partial<Category>];

// A piros a túllépés jelzése, ezért alapértelmezett kategória nem kapja meg.
const [BLUE, ORANGE, AQUA, YELLOW, MAGENTA, GREEN, VIOLET, , TEAL, BROWN, GRAY, PLUM, SLATE] = PALETTE;

const TEMPLATE: Template[] = [
  ['Fizetés', 'cash', 'bevetel', AQUA, 'Bevétel', { incomeMode: 'fix' }],
  ['Családi pótlék', 'gift', 'bevetel', AQUA, 'Bevétel', { incomeMode: 'fix' }],
  ['Egyéb bevétel', 'coin', 'bevetel', AQUA, 'Bevétel', { incomeMode: 'keret' }],
  ['Hitel / albérlet', 'home', 'fix', BLUE, 'Lakhatás', { dueDay: 15 }],
  ['Közös költség', 'building', 'fix', BLUE, 'Lakhatás', { dueDay: 15 }],
  ['Lakásbiztosítás', 'shield', 'fix', BLUE, 'Lakhatás', { dueDay: 20 }],
  ['Áram', 'bolt', 'fix', YELLOW, 'Rezsi', { dueDay: 15 }],
  ['Gáz', 'flame', 'fix', YELLOW, 'Rezsi', { dueDay: 15 }],
  ['Víz', 'droplet', 'fix', YELLOW, 'Rezsi', { dueDay: 15 }],
  ['Telefon', 'device-mobile', 'fix', YELLOW, 'Rezsi', { dueDay: 20 }],
  ['Internet és TV', 'wifi', 'fix', YELLOW, 'Rezsi', { dueDay: 20 }],
  ['Élelmiszer', 'shopping-cart', 'keret', ORANGE],
  ['Háztartás', 'basket', 'keret', AQUA],
  ['Közlekedés', 'car', 'keret', VIOLET],
  ['Gyerekek', 'mood-kid', 'keret', MAGENTA],
  ['Egészség', 'heart', 'keret', SLATE],
  ['Ruházat', 'shirt', 'keret', GREEN],
  ['Szabadidő', 'movie', 'keret', TEAL],
  ['Egyéb', 'dots', 'keret', GRAY],
  ['Váratlan kiadások', 'alert-triangle', 'keret', PLUM, undefined, { role: 'unexpected' }],
  ['Megtakarítás', 'pig-money', 'megtakaritas', BROWN],
];

export function newId(): string {
  return crypto.randomUUID();
}

export function defaultCategories(): Category[] {
  return TEMPLATE.map(([name, icon, type, color, group, extra], order) => ({
    id: newId(), name, icon, type, color, group, defaultAmount: 0, order, archived: false, ...extra,
  }));
}

export const TYPE_LABEL: Record<CategoryType, string> = {
  bevetel: 'Bevétel',
  fix: 'Fix számla',
  keret: 'Keret',
  megtakaritas: 'Megtakarítás',
};

export function unexpectedCategory(order: number): Category {
  return {
    id: newId(), name: 'Váratlan kiadások', icon: 'alert-triangle', color: PLUM, type: 'keret',
    defaultAmount: 0, order, archived: false, role: 'unexpected',
  };
}
