import Dexie, { type Table } from 'dexie';
import type { Category, Entry, PeriodOverride, Plan, Settings } from '../domain/types';

export class BudgetDB extends Dexie {
  settings!: Table<Settings, string>;
  categories!: Table<Category, string>;
  plans!: Table<Plan, [string, string]>;
  entries!: Table<Entry, string>;
  periodOverrides!: Table<PeriodOverride, string>;

  constructor(name = 'csaladi-koltsegvetes') {
    super(name);
    this.version(1).stores({
      settings: 'id',
      categories: 'id, order',
      plans: '[periodId+categoryId], categoryId, periodId',
      entries: 'id, [periodId+categoryId], periodId, categoryId',
      periodOverrides: 'periodId',
    });
  }
}

export const db = new BudgetDB();
