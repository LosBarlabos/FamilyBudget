import Dexie, { type Table } from 'dexie';
import type { BudgetData, Category, Entry, PeriodOverride, Plan, Settings } from '../domain/types';

/** Közös használat: a legutóbb szinkronizált állapot (a háromutas összefésülés alapja) és a fájl sha-ja. */
export interface SyncMeta {
  key: 'base';
  data: BudgetData;
  sha: string;
  /** A legutóbbi sikeres szinkron ideje. */
  at: string;
}

export class BudgetDB extends Dexie {
  settings!: Table<Settings, string>;
  categories!: Table<Category, string>;
  plans!: Table<Plan, [string, string]>;
  entries!: Table<Entry, string>;
  periodOverrides!: Table<PeriodOverride, string>;
  syncMeta!: Table<SyncMeta, string>;

  constructor(name = 'csaladi-koltsegvetes') {
    super(name);
    this.version(1).stores({
      settings: 'id',
      categories: 'id, order',
      plans: '[periodId+categoryId], categoryId, periodId',
      entries: 'id, [periodId+categoryId], periodId, categoryId',
      periodOverrides: 'periodId',
    });
    this.version(2).stores({ syncMeta: 'key' });
  }
}

export const db = new BudgetDB();
