import { useEffect, useState } from 'react';
import { ICONS, newId, PALETTE, TYPE_LABEL } from '../../domain/defaults';
import { formatFt, parseAmount } from '../../domain/money';
import { countsInDaily } from '../../domain/pace';
import { periodDistance, periodFromName, periodName, periodRange, periodShortLabel, periodShortWithYear, shiftPeriod } from '../../domain/periods';
import { CYCLES, cycleLabel, cycleOf, nextDuePeriod, planChangeEffect, planStartId, plansRemovedFrom } from '../../domain/plans';
import { allowedTypes, type Category, type CategoryType, type PeriodId, type Plan } from '../../domain/types';
import { autoPaidPayments } from '../../domain/balance';
import { addCategory, reorderCategories, restoreCategory, restoreEntries, saveCategory, updateCategory } from '../../db/repo';
import { NEW_GOAL, useBudget, useSafe, useToast } from '../context';
import { CatIcon, Icon, useFieldErrors } from '../components/common';

export function Categories() {
  const { data, focusCategoryId, summaries, go } = useBudget();
  const toast = useToast();
  const safe = useSafe();
  const [editing, setEditing] = useState<string | null>(focusCategoryId === NEW_GOAL ? 'new-goal' : null);
  const used = new Set(data.entries.map((e) => e.categoryId));

  useEffect(() => {
    if (focusCategoryId === NEW_GOAL) {
      setEditing('new-goal');
      window.scrollTo({ top: 0 });
    }
  }, [focusCategoryId]);

  // Az új cél űrlapja az URL-ben is benne van (#/kategoriak/uj-cel); bezáráskor kikerül onnan, hogy a vissza
  // lépés vagy az újratöltés ne nyissa meg újra.
  const edit = (next: string | null) => {
    setEditing(next);
    if (next !== 'new-goal' && focusCategoryId === NEW_GOAL) go('categories');
  };
  const [showArchived, setShowArchived] = useState(false);
  const sorted = [...data.categories].sort((a, b) => a.order - b.order);
  const active = sorted.filter((c) => !c.archived);
  const archived = sorted.filter((c) => c.archived);
  const groups = [...new Set(data.categories.map((c) => c.group).filter((g): g is string => !!g))];
  // Az alapösszeg ettől az időszaktól hat (a költségvetés indulása előtt az elsőtől).
  const fromId = planStartId(summaries.currentId, data.settings.firstPeriodId);

  const move = (id: string, dir: -1 | 1) =>
    safe(async () => {
      const ids = active.map((c) => c.id);
      const i = ids.indexOf(id);
      const j = i + dir;
      if (j < 0 || j >= ids.length) return;
      [ids[i], ids[j]] = [ids[j], ids[i]];
      await reorderCategories([...ids, ...archived.map((c) => c.id)]);
    });

  const setArchived = (c: Category, archivedFlag: boolean) =>
    safe(async () => {
      await saveCategory({ ...c, archived: archivedFlag });
      toast(archivedFlag ? `${c.name} archiválva` : `${c.name} visszaállítva`, () => saveCategory(c));
    });

  const blank: Category = {
    id: newId(), name: '', icon: 'dots', color: PALETTE[0], type: 'keret', defaultAmount: 0,
    order: (sorted.at(-1)?.order ?? 0) + 1, archived: false,
  };

  return (
    <>
      <div className="page-head">
        <h1>Kategóriák</h1>
        <button className="primary" onClick={() => edit('new')}>
          <Icon name="plus" /> Új kategória
        </button>
      </div>

      {(editing === 'new' || editing === 'new-goal') && (
        <div className="card">
          {editing === 'new-goal' && <h2 style={{ marginBottom: 12 }}>Új megtakarítási cél</h2>}
          <CategoryForm
            key={editing}
            currentId={summaries.currentId}
            fromId={fromId}
            isNew
            initial={editing === 'new-goal' ? { ...blank, type: 'megtakaritas', icon: 'pig-money', color: PALETTE[9] } : blank}
            groups={groups}
            onCancel={() => edit(null)}
            hasEntries={false}
            onSave={(c) =>
              safe(async () => {
                await addCategory(c, summaries.currentId);
                edit(null);
                toast(
                  c.defaultAmount > 0
                    ? `${c.name} hozzáadva · terv ${formatFt(c.defaultAmount)} ${periodFromName(fromId)}`
                    : `${c.name} hozzáadva`,
                );
              })
            }
          />
        </div>
      )}

      <div className="card">
        {active.map((c, i) =>
          editing === c.id ? (
            <div key={c.id} className="cat-edit">
              <CategoryForm
                currentId={summaries.currentId}
                fromId={fromId}
                plans={data.plans}
                initial={c}
                groups={groups}
                hasEntries={used.has(c.id)}
                onCancel={() => edit(null)}
                onSave={(nc) =>
                  safe(async () => {
                    // A csoportos beszedés kikapcsolása ne írja át a múltat: az eddig automatikusan kifizetett
                    // számlák valódi rögzítést kapnak.
                    const autoPayments = c.autoPayFrom && !nc.autoPayFrom ? autoPaidPayments(summaries, c) : [];
                    const { plansBefore, amountChanged, fromId: from, addedEntryIds } = await updateCategory(c, nc, summaries.currentId, autoPayments);
                    edit(null);
                    // Ugyanúgy kimondja a törölt későbbi egyedi terveket, mint a Tervező.
                    const msg = amountChanged
                      ? `${nc.name} mentve · terv ${planChangeEffect(plansBefore, nc, from, nc.defaultAmount, 'from')}`
                      : addedEntryIds.length > 0
                        ? `${nc.name} mentve · az eddigi automatikus fizetések rögzítésként megmaradnak`
                        : `${nc.name} mentve`;
                    const cycleNote =
                      cycleOf(nc) > 1
                        ? ` · ${cycleLabel(cycleOf(nc))}, legközelebb ${periodName(nextDuePeriod(nc, summaries.currentId)).toLowerCase()}`
                        : '';
                    toast(msg + cycleNote, async () => {
                      await restoreCategory(c, plansBefore);
                      await restoreEntries([], addedEntryIds);
                    });
                  })
                }
              />
            </div>
          ) : (
            <CategoryRow
              key={c.id}
              cat={c}
              first={i === 0}
              last={i === active.length - 1}
              onUp={() => move(c.id, -1)}
              onDown={() => move(c.id, 1)}
              onEdit={() => edit(c.id)}
              onArchive={() => setArchived(c, true)}
            />
          ),
        )}
      </div>

      {archived.length > 0 && (
        <div className="card">
          <button className="ghost" onClick={() => setShowArchived(!showArchived)} aria-expanded={showArchived}>
            <Icon name="chevron-right" className={`chev ${showArchived ? 'open' : ''}`} />
            Archivált kategóriák ({archived.length})
          </button>
          {showArchived &&
            archived.map((c) => (
              <div key={c.id} className="cat-row">
                <CatIcon cat={c} />
                <div className="cat-meta">
                  <div className="rec-name">{c.name}</div>
                  <div className="tiny faint">{TYPE_LABEL[c.type]}{c.group ? ` · ${c.group}` : ''}</div>
                </div>
                <button className="sm" onClick={() => setArchived(c, false)}>
                  <Icon name="arrow-back-up" /> Visszaállítás
                </button>
              </div>
            ))}
        </div>
      )}
    </>
  );
}

function CategoryRow({
  cat, first, last, onUp, onDown, onEdit, onArchive,
}: {
  cat: Category;
  first: boolean;
  last: boolean;
  onUp: () => void;
  onDown: () => void;
  onEdit: () => void;
  onArchive: () => void;
}) {
  const meta = [
    TYPE_LABEL[cat.type],
    cat.group !== TYPE_LABEL[cat.type] ? cat.group : null,
    `alap ${formatFt(cat.defaultAmount)}`,
    cycleOf(cat) > 1 ? cycleLabel(cycleOf(cat)) : null,
    cat.type === 'fix' && cat.dueDay ? `esedékes: hó ${cat.dueDay}.` : null,
    cat.type === 'fix' && cat.dueDay && cat.autoPayFrom ? 'csoportos beszedés' : null,
    cat.type === 'bevetel' && cat.dueDay ? `érkezik: hó ${cat.dueDay}.` : null,
    cat.type === 'keret' && !countsInDaily(cat) ? 'napi összegen kívül' : null,
    cat.type === 'bevetel' ? (cat.incomeMode === 'keret' ? 'részletekben' : 'egy összegben') : null,
    cat.goalAmount ? `cél ${formatFt(cat.goalAmount)}${cat.goalDeadline ? `, ${periodShortWithYear(cat.goalDeadline)}` : ''}` : null,
  ].filter(Boolean);
  return (
    <div className="cat-row">
      <CatIcon cat={cat} />
      <div className="cat-meta">
        <div className="rec-name">{cat.name}</div>
        <div className="tiny faint num">{meta.join(' · ')}</div>
      </div>
      <div className="rec-actions">
        <button className="sm ghost icon" aria-label="Feljebb" onClick={onUp} disabled={first}><Icon name="arrow-up" /></button>
        <button className="sm ghost icon" aria-label="Lejjebb" onClick={onDown} disabled={last}><Icon name="arrow-down" /></button>
        <button className="sm" onClick={onEdit}><Icon name="pencil" /> Szerkesztés</button>
        <button className="sm ghost icon" aria-label="Archiválás" title="Archiválás" onClick={onArchive}><Icon name="archive" /></button>
      </div>
    </div>
  );
}

export function CategoryForm({
  initial, groups, onSave, onCancel, currentId, fromId, isNew = false, plans = [], hasEntries,
}: {
  currentId: string;
  /** Ettől az időszaktól lesz terv az alapösszeg. */
  fromId: PeriodId;
  isNew?: boolean;
  /** A meglévő tervek: a mentés előtt látszik, mely későbbi egyedi tervek törlődnének. */
  plans?: Plan[];
  /** Van-e már rögzítése: ilyenkor a típus csak fix és keret között váltható. */
  hasEntries: boolean;
  initial: Category;
  groups: string[];
  onSave: (c: Category) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [c, setC] = useState<Category>(initial);
  const [amountText, setAmountText] = useState(initial.defaultAmount ? String(initial.defaultAmount) : '');
  const [dueText, setDueText] = useState(initial.dueDay ? String(initial.dueDay) : '');
  const [goalText, setGoalText] = useState(initial.goalAmount ? String(initial.goalAmount) : '');
  const [goalStartText, setGoalStartText] = useState(initial.goalStart ? String(initial.goalStart) : '');
  // Határidő: a mostani időszaktól 10 évig, plusz a már beállított (akár múltbeli) érték.
  const deadlines = periodRange(currentId, shiftPeriod(currentId, 120));
  if (initial.goalDeadline && !deadlines.includes(initial.goalDeadline)) deadlines.unshift(initial.goalDeadline);
  const { field, message, check } = useFieldErrors<'name' | 'amount' | 'due' | 'goal' | 'goalStart'>();
  const set = (patch: Partial<Category>) => setC({ ...c, ...patch });
  // Esedékességi nap a fix számlának és az egyösszegű bevételnek van (a számlanaptár ehhez igazodik).
  const hasDueDay = c.type === 'fix' || (c.type === 'bevetel' && (c.incomeMode ?? 'fix') === 'fix');
  const cycle = c.type === 'fix' ? (c.cycleMonths ?? 1) : 1;
  // A „legközelebb” választó a mostani időszaktól egy teljes ciklusnyi hónapot kínál.
  const cycleChoices = cycle > 1 ? periodRange(currentId, shiftPeriod(currentId, cycle - 1)) : [];
  const setCycle = (months: number) => {
    if (months === 1) return set({ cycleMonths: undefined, cycleStart: undefined });
    // A meglévő ciklus következő esedékessége marad kiválasztva, ha az az új ciklusban is választható.
    const next = initial.cycleStart ? nextDuePeriod({ ...initial, type: 'fix' }, currentId) : currentId;
    set({ cycleMonths: months, cycleStart: periodDistance(currentId, next) < months ? next : currentId });
  };
  // Az eredeti típusból számol, hogy szerkesztés közbeni váltás után is visszaválasztható legyen.
  const types = allowedTypes(initial, hasEntries);
  const typedAmount = amountText.trim() === '' || amountText.trim() === '0' ? 0 : parseAmount(amountText);
  const removedLater =
    !isNew && typedAmount !== null && typedAmount !== initial.defaultAmount ? plansRemovedFrom(plans, initial, fromId, typedAmount) : [];
  const effect = isNew
    ? `${capitalize(periodFromName(fromId))} ez lesz a terv, a korábbi hónapokat nem érinti.`
    : `Ha módosítod, ${periodFromName(fromId)} ez lesz minden hónap terve, a Tervezőben megadott értékek helyett is. A korábbi hónapokat nem érinti.`;

  const save = () => {
    const e: Partial<Record<'name' | 'amount' | 'due' | 'goal' | 'goalStart', string>> = {};
    if (!c.name.trim()) e.name = 'Adj nevet a kategóriának';
    const amount = typedAmount;
    if (amount === null) e.amount = 'Ez nem érvényes összeg';
    const due = dueText.trim() === '' ? undefined : Number(dueText);
    if (due !== undefined && (!Number.isInteger(due) || due < 1 || due > 31)) e.due = '1 és 31 közötti nap';
    else if (c.type === 'fix' && c.autoPayFrom && due === undefined) e.due = 'A csoportos beszedéshez add meg az esedékesség napját';
    const savings = c.type === 'megtakaritas';
    const goal = goalText.trim() === '' ? undefined : parseAmount(goalText);
    if (savings && goal === null) e.goal = 'Ez nem érvényes összeg';
    const goalStart = goalStartText.trim() === '' || goalStartText.trim() === '0' ? undefined : parseAmount(goalStartText);
    if (savings && goalStart === null) e.goalStart = 'Ez nem érvényes összeg';
    if (!check(e)) return;
    onSave({
      ...c,
      name: c.name.trim(),
      group: c.group?.trim() || undefined,
      defaultAmount: amount ?? 0,
      dueDay: hasDueDay ? due : undefined,
      cycleMonths: cycle > 1 ? cycle : undefined,
      cycleStart: cycle > 1 ? c.cycleStart : undefined,
      autoPayFrom: c.type === 'fix' && due !== undefined ? c.autoPayFrom : undefined,
      incomeMode: c.type === 'bevetel' ? (c.incomeMode ?? 'fix') : undefined,
      goalAmount: savings ? (goal ?? undefined) : undefined,
      goalDeadline: savings && goal ? c.goalDeadline : undefined,
      goalStart: savings ? (goalStart ?? undefined) : undefined,
      excludeFromDaily: c.type === 'keret' ? c.excludeFromDaily : undefined,
    });
  };

  return (
    <div className="cat-form" onKeyDown={(e) => e.key === 'Escape' && onCancel()}>
      <div className="form-grid">
        <label className="field">
          Név
          <input type="text" value={c.name} autoFocus placeholder="Élelmiszer" onChange={(e) => set({ name: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && save()} {...field('name')} />
          {message('name')}
        </label>
        <label className="field">
          Típus
          {/* A körbeölelő címke a select összes lehetőségét a nevébe olvasná: külön név kell. */}
          <select
            aria-label="Típus"
            value={c.type}
            disabled={types.length === 1}
            aria-describedby={hasEntries ? 'cat-type-hint' : undefined}
            onChange={(e) => set({ type: e.target.value as CategoryType })}
          >
            {types.map((t) => (
              <option key={t} value={t}>{TYPE_LABEL[t]}</option>
            ))}
          </select>
          {hasEntries && (
            <span id="cat-type-hint" className="tiny faint">
              {types.length === 1
                ? 'Már van rögzítése, ezért a típusa nem módosítható. Archiváld, és hozz létre újat.'
                : 'Már van rögzítése: csak fix számla és keret között váltható. Más típushoz archiváld, és hozz létre újat.'}
            </span>
          )}
        </label>
        <label className="field">
          Csoport (nem kötelező)
          <input type="text" list="cat-groups" value={c.group ?? ''} placeholder="Rezsi" onChange={(e) => set({ group: e.target.value })} />
          <datalist id="cat-groups">{groups.map((g) => <option key={g} value={g} />)}</datalist>
        </label>
        <label className="field">
          {cycle > 1 ? 'Összeg alkalmanként' : 'Alapértelmezett havi összeg'}
          <input type="text" inputMode="numeric" className="num" value={amountText} placeholder="0" onChange={(e) => setAmountText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} {...field('amount')} />
          {message('amount')}
          {removedLater.length > 0 && (
            <span className="tiny num later-plans">
              <Icon name="alert-triangle" />
              Mentéskor törlődik: {removedLater.map((p) => `${periodShortLabel(p.periodId, fromId)}: ${formatFt(p.amount)}`).join(', ')}
            </span>
          )}
        </label>
        {c.type === 'fix' && (
          <label className="field">
            Milyen gyakran?
            <select aria-label="Milyen gyakran?" value={cycle} onChange={(e) => setCycle(Number(e.target.value))}>
              {CYCLES.map((x) => (
                <option key={x.months} value={x.months}>{capitalize(x.label)}</option>
              ))}
            </select>
          </label>
        )}
        {cycle > 1 && (
          <label className="field">
            Legközelebb esedékes
            <select aria-label="Legközelebb esedékes" value={c.cycleStart ?? currentId} onChange={(e) => set({ cycleStart: e.target.value })}>
              {cycleChoices.map((p) => (
                <option key={p} value={p}>{periodName(p, p.slice(0, 4) !== currentId.slice(0, 4))}</option>
              ))}
            </select>
          </label>
        )}
        {hasDueDay && (
          <label className="field">
            {c.type === 'fix' ? 'Esedékesség napja' : 'Érkezés napja'} (nem kötelező)
            <input type="number" min={1} max={31} value={dueText} placeholder="15" onChange={(e) => setDueText(e.target.value)} {...field('due')} />
            {message('due')}
          </label>
        )}
        {c.type === 'bevetel' && (
          <label className="field">
            Hogyan érkezik?
            <select aria-label="Hogyan érkezik?" value={c.incomeMode ?? 'fix'} onChange={(e) => set({ incomeMode: e.target.value as 'fix' | 'keret' })}>
              <option value="fix">Egy összegben (pl. fizetés)</option>
              <option value="keret">Több részletben</option>
            </select>
          </label>
        )}
      </div>
      {c.type === 'fix' && (
        <div className="check-field-wrap">
          <label className="check-field">
            <input
              type="checkbox"
              checked={!!c.autoPayFrom}
              aria-describedby="cat-autopay-hint"
              // Az első bekapcsolás a mostani időszaktól hat; a korábbi kifizetéseket nem írja át.
              onChange={(e) => set({ autoPayFrom: e.target.checked ? (initial.autoPayFrom ?? currentId) : undefined })}
            />
            Csoportos beszedés (automatikusan kifizetve)
          </label>
          <span id="cat-autopay-hint" className="tiny faint">
            Az esedékesség napján magától kifizetettnek számít a terv összegével. Ha a terhelés más összeg volt, a
            Rögzítésen javítható.
          </span>
        </div>
      )}
      {c.type === 'keret' && (
        <div className="check-field-wrap">
          <label className="check-field">
            <input
              type="checkbox"
              checked={countsInDaily(c)}
              aria-describedby="cat-daily-hint"
              onChange={(e) => set({ excludeFromDaily: !e.target.checked })}
            />
            Beleszámít a napi elkölthető összegbe
          </label>
          <span id="cat-daily-hint" className="tiny faint">
            A nem naponta fogyó keretnél (pl. váratlan kiadások, éves ruhavásárlás) érdemes kikapcsolni: ilyenkor nincs
            napi tempója, csak a túllépés látszik.
          </span>
        </div>
      )}
      {c.type === 'megtakaritas' && (
        <div className="form-grid goal-fields">
          <label className="field">
            Célösszeg (nem kötelező)
            <input type="text" inputMode="numeric" className="num" value={goalText} placeholder="800 000" onChange={(e) => setGoalText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} {...field('goal')} />
            {message('goal')}
          </label>
          <label className="field">
            Határidő (nem kötelező)
            <select aria-label="Határidő" value={c.goalDeadline ?? ''} disabled={!goalText.trim()} onChange={(e) => set({ goalDeadline: e.target.value || undefined })}>
              <option value="">Nincs határidő</option>
              {deadlines.map((p) => (
                <option key={p} value={p}>{periodName(p, true)} végéig</option>
              ))}
            </select>
          </label>
          <label className="field">
            Ebből már félretéve
            <input type="text" inputMode="numeric" className="num" value={goalStartText} placeholder="0" onChange={(e) => setGoalStartText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} {...field('goalStart')} />
            {message('goalStart')}
          </label>
        </div>
      )}
      <div className="tiny faint" style={{ margin: '6px 0 14px' }}>
        {c.type === 'megtakaritas'
          ? `Az alapértelmezett összeg a havi félretétel terve. ${effect} A célnál látod, mikor gyűlik össze, és határidőnél azt is, mennyi kell havonta.`
          : cycle > 1
            ? `Az összeg egy alkalomra szól, és csak az esedékes hónapokban kerül a tervbe; a köztes hónapokban 0. ${effect}`
            : `Az alapértelmezett összeg a havi terv. ${effect}`}
      </div>

      <div className="field small muted" style={{ marginBottom: 6 }}>Ikon</div>
      <div className="icon-grid" role="radiogroup" aria-label="Ikon">
        {ICONS.map((i) => (
          <button key={i} role="radio" aria-checked={c.icon === i} aria-label={i} className={`icon-pick ${c.icon === i ? 'on' : ''}`} onClick={() => set({ icon: i })}>
            <Icon name={i} />
          </button>
        ))}
      </div>
      <div className="field small muted" style={{ margin: '12px 0 6px' }}>Szín</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }} role="radiogroup" aria-label="Szín">
        {PALETTE.map((col) => (
          <button
            key={col}
            role="radio"
            aria-checked={c.color === col}
            aria-label={col}
            className={`swatch ${c.color === col ? 'on' : ''}`}
            style={{ background: col }}
            onClick={() => set({ color: col })}
          />
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 16, alignItems: 'center' }}>
        <CatIcon cat={c} />
        <span className="muted small" style={{ marginRight: 'auto' }}>{c.name || 'Előnézet'}</span>
        <button onClick={onCancel}>Mégse</button>
        <button className="primary" onClick={save}>Mentés</button>
      </div>
    </div>
  );
}

const capitalize = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
