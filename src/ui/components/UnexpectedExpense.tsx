import { useEffect, useMemo, useRef, useState } from 'react';
import { countedAmount } from '../../domain/balance';
import { goalProgress } from '../../domain/goals';
import { formatFt, parseAmount } from '../../domain/money';
import { clampToPeriod } from '../../domain/periods';
import { isExpense } from '../../domain/types';
import { addEntry, ensureUnexpectedCategory, restoreEntries } from '../../db/repo';
import { useBudget, useSafe, useToast } from '../context';
import { Icon, NOTE_TAGS_LIST } from './common';

const UNEXPECTED = '__unexpected__';

/** A gyorsrögzítőben már beírt összeg és megjegyzés; a panel következő megnyitása átveszi. */
let draft: { amount: string; note: string } | null = null;

export function handOffUnexpected(d: { amount: string; note: string }) {
  draft = d.amount.trim() || d.note.trim() ? d : null;
}

/** Hó közbeni, nem tervezett kiadás gyors rögzítése a havi pénzből vagy egy megtakarításból. */
export function UnexpectedExpense({ onClose }: { onClose: () => void }) {
  const { data, summaries, periodId, cfg, today, go } = useBudget();
  const toast = useToast();
  const safe = useSafe();
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const p = summaries.byId.get(periodId)!;
  const [amountText, setAmountText] = useState(() => draft?.amount ?? '');
  const [note, setNote] = useState(() => draft?.note ?? '');
  // Egyszer használatos: a panel egy későbbi megnyitása már üresen induljon.
  useEffect(() => {
    draft = null;
  }, []);
  const [source, setSource] = useState<'monthly' | 'savings'>('monthly');
  const unexpectedCat = data.categories.find((c) => c.role === 'unexpected' && !c.archived);
  const [catId, setCatId] = useState(unexpectedCat?.id ?? UNEXPECTED);
  const savings = useMemo(
    () =>
      data.categories
        .filter((c) => c.type === 'megtakaritas' && !c.archived)
        .map((c) => ({ cat: c, saved: goalProgress(c, data, summaries.currentId).saved })),
    [data, summaries.currentId],
  );
  const [savingsId, setSavingsId] = useState(savings.find((s) => s.saved > 0)?.cat.id ?? savings[0]?.cat.id ?? '');
  const [error, setError] = useState('');

  const expenseCats = data.categories.filter((c) => isExpense(c) && !c.archived && c.role !== 'unexpected').sort((a, b) => a.order - b.order);
  const amount = parseAmount(amountText);
  const chosenSavings = savings.find((s) => s.cat.id === savingsId);

  let impact: string | null = null;
  if (amount) {
    if (source === 'savings' && chosenSavings) {
      impact = `${chosenSavings.cat.name}: ${formatFt(chosenSavings.saved)} → ${formatFt(chosenSavings.saved - amount)}. A futó egyenleg nem változik, mert ez a pénz már félre van téve.`;
    } else if (source === 'monthly') {
      const f = p.byCategory.get(catId) ?? { plan: 0, actual: 0, settled: false };
      const delta =
        countedAmount(p.status, f.plan, f.actual + amount, f.settled) - countedAmount(p.status, f.plan, f.actual, f.settled);
      const name = catId === UNEXPECTED ? 'Váratlan kiadások' : data.categories.find((c) => c.id === catId)?.name;
      // Jövőbeli időszakban is max(tény, terv) számít, így az előre rögzített kiadás is látszik az előrejelzésben.
      impact =
        delta === 0
          ? `Belefér a(z) ${name} keretbe, a futó egyenleg nem változik.`
          : delta < amount
            ? `A(z) ${name} keretből ${formatFt(amount - delta)} még fedezi, a futó egyenleg ${formatFt(delta)}-tal csökken.`
            : `A futó egyenleg ${formatFt(delta)}-tal csökken.`;
    }
  }

  const submit = async () => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    await safe(save);
    busy.current = false;
    setPending(false);
  };

  const save = async () => {
    if (amount === null) return setError(amountText.trim() ? 'Ez nem érvényes összeg' : 'Adj meg egy összeget');
    const date = clampToPeriod(today, periodId, cfg);
    const text = note.trim() || undefined;
    if (source === 'savings') {
      if (!chosenSavings) return setError('Nincs megtakarítási kategória');
      if (amount > chosenSavings.saved) return setError(`Ezen csak ${formatFt(chosenSavings.saved)} van`);
      // A kimutatásokban a választott kategória kiadásaként látszik, „megtakarításból” jelöléssel.
      const spend = catId === UNEXPECTED ? await ensureUnexpectedCategory() : data.categories.find((c) => c.id === catId);
      const e = await addEntry(periodId, chosenSavings.cat.id, amount, date, text, 'withdrawal', false, spend?.id);
      toast(`${chosenSavings.cat.name}: ${formatFt(amount)} felhasználva`, () => restoreEntries([], [e.id]));
      onClose();
      go('record', chosenSavings.cat.id);
      return;
    }
    const cat = catId === UNEXPECTED ? await ensureUnexpectedCategory() : data.categories.find((c) => c.id === catId)!;
    const e = await addEntry(periodId, cat.id, amount, date, text);
    toast(`Váratlan kiadás: ${formatFt(amount)} (${cat.name})`, () => restoreEntries([], [e.id]));
    onClose();
    go('record', cat.id);
  };

  return (
    <div className="card unexpected" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="card-head">
        <h2 className="cluster gap-2">
          <Icon name="alert-triangle" style={{ color: 'var(--color-danger)' }} /> Váratlan kiadás
        </h2>
        <button className="btn sm ghost icon" aria-label="Bezárás" onClick={onClose}><Icon name="x" /></button>
      </div>
      <div className="form-grid">
        <label className="field">
          Összeg
          <input type="text" inputMode="numeric" className="num" autoFocus placeholder="45 000" value={amountText}
            aria-invalid={!!error}
            onChange={(e) => { setAmountText(e.target.value); setError(''); }}
            onKeyDown={(e) => e.key === 'Enter' && submit()} />
        </label>
        <label className="field">
          Mire ment?
          <input type="text" list={NOTE_TAGS_LIST} placeholder="Autószerelés" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
        </label>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', margin: '14px 0 10px' }}>
        <span className="small muted">Miből fizeted?</span>
        <div className="seg" role="group" aria-label="Miből fizeted">
          <button className={source === 'monthly' ? 'on' : ''} onClick={() => { setSource('monthly'); setError(''); }}>A havi pénzből</button>
          <button className={source === 'savings' ? 'on' : ''} onClick={() => { setSource('savings'); setError(''); }} disabled={savings.length === 0}>
            Megtakarításból
          </button>
        </div>
        {source === 'savings' && (
          <select className="sm" aria-label="Megtakarítás" value={savingsId} onChange={(e) => { setSavingsId(e.target.value); setError(''); }}>
            {savings.map((s) => <option key={s.cat.id} value={s.cat.id}>{s.cat.name} · {formatFt(s.saved)} van rajta</option>)}
          </select>
        )}
        {/* Megtakarításból fizetve is egy kiadási kategóriához tartozik: az Elemzésben annak költéseként látszik. */}
        <select className="sm" aria-label={source === 'savings' ? 'Melyik kiadásként jelenjen meg' : 'Kategória'} value={catId} onChange={(e) => setCatId(e.target.value)}>
          <option value={unexpectedCat?.id ?? UNEXPECTED}>{unexpectedCat?.name ?? 'Váratlan kiadások'}</option>
          <optgroup label="Vagy egy meglévő kategória">
            {expenseCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </optgroup>
        </select>
      </div>

      {impact && <div className="small muted impact"><Icon name="info-circle" /> {impact}</div>}
      {error && <div className="error mt-1-5">{error}</div>}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
        <button className="btn" onClick={onClose}>Mégse</button>
        <button className="btn primary" onClick={submit} disabled={pending}>Rögzítés</button>
      </div>
    </div>
  );
}
