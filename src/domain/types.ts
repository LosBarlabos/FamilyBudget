export type CategoryType = 'fix' | 'keret' | 'bevetel' | 'megtakaritas';

/** 'YYYY-MM' – annak a hónapnak az azonosítója, amelyikben az időszak kezdődik. */
export type PeriodId = string;

/** 'YYYY-MM-DD', helyi idő szerint. */
export type ISODate = string;

export interface Settings {
  id: 'settings';
  payday: number;
  openingBalance: number;
  firstPeriodId: PeriodId;
  forecastPeriods: number;
  lastExportAt?: string;
  /** Az utolsó időszak, amelynél a felhasználó már látta az „új időszak” mentési ajánlatot. */
  lastSeenPeriodId?: PeriodId;
  createdAt: string;
}

export interface PeriodOverride {
  periodId: PeriodId;
  startDate: ISODate;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  type: CategoryType;
  group?: string;
  defaultAmount: number;
  dueDay?: number;
  incomeMode?: 'fix' | 'keret';
  /** Csak 'megtakaritas': megtakarítási cél. */
  goalAmount?: number;
  /** Az az időszak, amelynek a végére a célnak össze kell gyűlnie. */
  goalDeadline?: PeriodId;
  /** A cél kezdetekor már félretett összeg. */
  goalStart?: number;
  /** Rendszerszerep: a „Váratlan kiadás” gomb ide rögzít alapértelmezésben (átnevezhető). */
  role?: 'unexpected';
  /**
   * Csak 'keret': nem számít bele a napi elkölthető összegbe (és nincs tempója). Ha nincs megadva, minden
   * keret beleszámít, kivéve a váratlan kiadásokét (lásd countsInDaily).
   */
  excludeFromDaily?: boolean;
  order: number;
  archived: boolean;
}

export interface Plan {
  periodId: PeriodId;
  categoryId: string;
  amount: number;
}

export interface Entry {
  id: string;
  periodId: PeriodId;
  categoryId: string;
  amount: number;
  date: ISODate;
  note?: string;
  /**
   * 'withdrawal': a megtakarításból elköltött összeg. A cél egyenlegét csökkenti, de a futó egyenleget
   * nem érinti, mert a pénz már a félretételkor kikerült belőle.
   */
  kind?: 'withdrawal';
  /**
   * Fix tételnél (számla, egyösszegű bevétel, megtakarítás): ezzel a tétel ebben az időszakban lezárult,
   * több rögzítés nem várható, akkor sem, ha a tény eltér a tervtől. Ilyenkor a futó egyenleg a tényt számolja.
   */
  settles?: true;
  /**
   * A „Havi összeg megadása” írta: a hónap egészét összegzi, nem egy vásárlást, ezért a javasolt gyorsgomb-összegek
   * között nem jelenik meg.
   */
  monthlyTotal?: true;
  createdAt: string;
}

export interface BudgetData {
  settings: Settings;
  categories: Category[];
  plans: Plan[];
  entries: Entry[];
  overrides: PeriodOverride[];
}

/** Hogyan rögzül a kategória: egy összegű számlaként vagy részletekben töltődő keretként. */
export function recordStyle(c: Category): 'fix' | 'keret' {
  if (c.type === 'bevetel') return c.incomeMode ?? 'fix';
  if (c.type === 'megtakaritas') return 'fix';
  return c.type;
}

export function isExpense(c: Category): boolean {
  return c.type === 'fix' || c.type === 'keret';
}

/**
 * A kategória típusa, amire módosítható. Rögzítések mellett csak a fix és a keret cserélhető fel (mindkettő
 * kiadás); más váltás a múltbeli tényeket is átfordítaná (pl. kiadásból bevétel lenne).
 */
export function allowedTypes(c: Pick<Category, 'type'>, hasEntries: boolean): CategoryType[] {
  if (!hasEntries) return ['fix', 'keret', 'bevetel', 'megtakaritas'];
  return c.type === 'fix' || c.type === 'keret' ? ['fix', 'keret'] : [c.type];
}
