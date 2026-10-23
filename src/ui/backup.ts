import { differenceInCalendarDays } from 'date-fns';
import { buildExport, exportFileName } from '../domain/exportFormat';
import type { BudgetData } from '../domain/types';
import { updateSettings } from '../db/repo';
import { downloadFile } from './components/common';

export const BACKUP_WARN_DAYS = 30;

export async function exportBackup(data: BudgetData) {
  const now = new Date();
  downloadFile(exportFileName(now), JSON.stringify(buildExport(data, now), null, 2), 'application/json');
  await updateSettings({ lastExportAt: now.toISOString() });
}

export function daysSince(iso: string | undefined, now = new Date()): number | null {
  return iso ? differenceInCalendarDays(now, new Date(iso)) : null;
}

export function backupLabel(days: number | null): string {
  if (days === null) return 'Még nincs letöltött mentés';
  if (days === 0) return 'Letöltve ma';
  if (days === 1) return 'Letöltve tegnap';
  return `Letöltve ${days} napja`;
}

/** Figyelmeztetés: ha 30 napnál régebbi a mentés, vagy még nincs, de az app már egy hete használatban van. */
export function backupIsStale(data: BudgetData, now = new Date()): boolean {
  const d = daysSince(data.settings.lastExportAt, now);
  if (d === null) return (daysSince(data.settings.createdAt, now) ?? 0) >= 7;
  return d >= BACKUP_WARN_DAYS;
}
