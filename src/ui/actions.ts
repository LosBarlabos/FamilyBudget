import { useCallback } from 'react';
import { settleMessage } from '../domain/status';
import type { Category, ISODate, PeriodId } from '../domain/types';
import { addSettlingEntry, restoreEntries } from '../db/repo';
import { useToast } from './context';

/**
 * Fix tétel egy kattintásos lezárása a hátralékkal („Kifizetve”, „Megérkezett”, „Félretéve”, „Maradék”),
 * visszavonható üzenettel. A Rögzítés és az Áttekintés teendői is ezt használják, hogy ugyanúgy működjenek.
 * Hibánál dob; a hívó a safe()-fel jelzi.
 */
export function useSettleRest() {
  const toast = useToast();
  return useCallback(
    async (periodId: PeriodId, cat: Category, amount: number, date: ISODate, partial: boolean, note?: string) => {
      const e = await addSettlingEntry(periodId, cat.id, amount, date, note);
      toast(settleMessage(cat, amount, partial), () => restoreEntries([], [e.id]));
    },
    [toast],
  );
}
