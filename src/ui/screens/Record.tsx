import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { coverAllowed, feeDismissKey, feeSuggestions, feeSuggestionText, needsCover, withDismissal } from '../../domain/flex';
import { goalProgress, goalSummary, type GoalProgress } from '../../domain/goals';
import { formatFt } from '../../domain/money';
import { envelopeLeftText, paceOverview, type EnvelopeStatus } from '../../domain/pace';
import { clampToPeriod, periodName, shortDate } from '../../domain/periods';
import { cycleLabel, cycleOf, isDuePeriod, nextDuePeriod, planChangeSummary } from '../../domain/plans';
import { recentEntries, recordedAtText, suggestedAmounts } from '../../domain/quick';
import { dueDateInPeriod, fixStatus, isOverdue, PAID_WORD, settleLabel } from '../../domain/status';
import type { PeriodSummary } from '../../domain/balance';
import type { Category, Entry, ISODate } from '../../domain/types';
import { isExpense, recordStyle } from '../../domain/types';
import {
  addEntry, addSettlingEntry, changePlan, clearEntries, deleteEntry, markSettled, restoreEntries, restorePlansOf, setMonthlyTotal,
} from '../../db/repo';
import { useSettleRest } from '../actions';
import { UNEXPECTED_PANEL, useBudget, useSafe, useToast } from '../context';
import { AmountInput, Badge, Bar, CatIcon, Icon, Stat, MenuButton, PACE_TONE, useLocalState, type MenuItem } from '../components/common';
import { GoalStateChip } from '../components/Goals';
import { UnexpectedExpense } from '../components/UnexpectedExpense';
import { PeriodSwitcher } from '../components/PeriodSwitcher';

export function Record() {
  const { data, summaries, periodId, cfg, today, focusCategoryId, clearFocus } = useBudget();
  const p = summaries.byId.get(periodId)!;
  const active = data.categories.filter((c) => !c.archived);
  const entryDate = clampToPeriod(today, periodId, cfg);
  const [unexpectedOpen, setUnexpectedOpen] = useState(false);
  // A gyorsrögzítő linkje a már nyitott panelt is újranyitja, hogy átvegye az ott beírt összeget.
  const [unexpectedKey, setUnexpectedKey] = useState(0);

  // A befizetések/rögzítések és a megtakarításból való felhasználások külön listában.
  const [entriesByCat, withdrawalsByCat] = useMemo(() => {
    const dep = new Map<string, Entry[]>();
    const wd = new Map<string, Entry[]>();
    for (const e of data.entries) {
      if (e.periodId !== periodId) continue;
      const m = e.kind === 'withdrawal' ? wd : dep;
      const l = m.get(e.categoryId);
      if (l) l.push(e);
      else m.set(e.categoryId, [e]);
    }
    for (const m of [dep, wd]) for (const l of m.values()) l.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return [dep, wd];
  }, [data.entries, periodId]);

  // Díjváltozás-javaslatok a tervtől eltérő összeggel kifizetett számláknál. Az elutasítás időszakonként és
  // kategóriánként a böngészőben marad meg.
  const [feeDismissed, setFeeDismissed] = useLocalState<string[]>('fee-dismissed', []);
  const fees = useMemo(
    () => feeSuggestions(data.categories, p, data.plans, data.settings.firstPeriodId, feeDismissed),
    [data.categories, p, data.plans, data.settings.firstPeriodId, feeDismissed],
  );
  const toast = useToast();
  const dismissFee = (c: Category) => {
    const key = feeDismissKey(periodId, c.id);
    setFeeDismissed((l) => withDismissal(l, key));
    toast(`${c.name}: a terv marad ${formatFt(fig(c).plan)}`, () => setFeeDismissed((l) => l.filter((k) => k !== key)));
  };

  // A kifizetett számlák összecsukódnak, de csak azok, amelyek a megnyitáskor (vagy időszakváltáskor) már
  // kifizetettek voltak: az épp most lezárt sor a helyén marad, hogy a fókusz és a visszavonás ne ugorjon el.
  // A díjváltozás-javaslatos számla sem csukódik össze, különben a javaslat nem látszana.
  const [collapsed, setCollapsed] = useState(() => ({ periodId, ids: new Set(doneFixedIds(data, p).filter((id) => !fees.has(id))) }));
  const collapsedIds = collapsed.ids;

  // Egyszerre egy keretsor lehet kinyitva.
  const [openId, setOpenId] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  // A sorhoz görgetés (és a fókusz) a kinyitás utáni megjelenítésre vár.
  const [focusReq, setFocusReq] = useState<{ id: string; at: number } | null>(null);

  // A fókusz egyszeri: kikerül az URL-ből, hogy a vissza lépés és az újratöltés ne görgessen ide újra,
  // felülírva, ahol a felhasználó tartott.
  useEffect(() => {
    if (!focusCategoryId) return;
    clearFocus();
    if (focusCategoryId === UNEXPECTED_PANEL) {
      setUnexpectedOpen(true);
      setUnexpectedKey((k) => k + 1);
      window.scrollTo({ top: 0 });
      return;
    }
    const c = data.categories.find((x) => x.id === focusCategoryId);
    if (!c) return;
    if (recordStyle(c) === 'keret') setOpenId(c.id);
    // Az összecsukott, már kifizetett számlák közül is elő kell kerülnie.
    if (collapsedIds.has(c.id)) setShowDone(true);
    setFocusReq({ id: c.id, at: Date.now() });
  }, [focusCategoryId, clearFocus, data.categories, collapsedIds]);

  useEffect(() => {
    if (!focusReq) return;
    const el = document.getElementById(`cat-${focusReq.id}`);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
    // A kinyitott keretsornál az összegmező kapja a fókuszt, hogy rögtön lehessen gépelni.
    el.querySelector<HTMLInputElement>('input[data-amount]')?.focus({ preventScroll: true });
  }, [focusReq]);

  const fig = (c: Category) => p.byCategory.get(c.id) ?? { plan: 0, actual: 0, counted: 0, settled: false };
  // A keretek tempója és a napi összeg ugyanabból számol, mint az Áttekintés.
  const pace = useMemo(() => paceOverview(data.categories, p, today), [data.categories, p, today]);
  // A nem havonta esedékes számlának a köztes hónapban nincs esedékessége.
  const due = (c: Category) => (c.dueDay && isDuePeriod(c, p.id) ? dueDateInPeriod(c.dueDay, p.start, p.end) : null);

  const income = active.filter((c) => c.type === 'bevetel');
  const fixed = active
    .filter((c) => c.type === 'fix')
    .sort((a, b) => (a.dueDay ?? 99) - (b.dueDay ?? 99) || a.order - b.order);
  const savings = active.filter((c) => c.type === 'megtakaritas');
  const envelopes = active.filter((c) => c.type === 'keret');

  const expActual = [...fixed, ...envelopes].reduce((s, c) => s + fig(c).actual, 0);
  const expPlan = [...fixed, ...envelopes].reduce((s, c) => s + fig(c).plan, 0);
  const fixSt = (c: Category) => fixStatus(fig(c).plan, fig(c).actual, fig(c).settled);
  const doneIds = doneFixedIds(data, p);
  // A számláló csak az ebben az időszakban esedékes számlákat számolja: a nem esedékes (pl. évente fizetett)
  // számlát itt nem lehet kifizetni, így a „7 / 9” sosem érhetné el a teljes számot.
  const dueFixed = fixed.filter((c) => isDuePeriod(c, p.id));
  const fixDone = dueFixed.filter((c) => doneIds.includes(c.id)).length;
  const fixLeft = fixed.reduce((s, c) => s + (fig(c).settled ? 0 : Math.max(0, fig(c).plan - fig(c).actual)), 0);
  // Terv nélkül (pl. az első időszak előtt) nincs mit kifizetni, így lejárni sem tud.
  const checkOverdue = (c: Category) => p.status === 'current' && fig(c).plan > 0;
  const overdue = fixed.filter((c) => checkOverdue(c) && isOverdue(due(c), today, fixSt(c))).length;
  const envLeft = envelopes.reduce((s, c) => s + Math.max(0, fig(c).plan - fig(c).actual), 0);
  const envOver = envelopes.filter((c) => fig(c).plan > 0 && fig(c).actual > fig(c).plan).length;
  const envFast = envelopes.filter((c) => pace.byId.get(c.id)?.pace === 'fast').length;
  // A terv nélküli költés is csökkenti a napi összeget, ezért nem lehet „minden keret rendben”.
  const envUnplanned = pace.unplanned.length;
  const envNotes = [
    envOver > 0 && <span className="neg">{envOver} keret túllépve</span>,
    envUnplanned > 0 && <span className="warn-text">{envUnplanned} keretben terv nélküli költés</span>,
    envFast > 0 && <span className="warn-text">{envFast} keret gyorsan fogy</span>,
  ].filter(Boolean);
  // A folyamatban lévő időszakban ugyanaz a szám, mint az Áttekintés „Még elkölthető” értéke.
  const allowance = p.status === 'current' && pace.hasDailyPlan ? pace.allowance : null;

  if (collapsed.periodId !== periodId) {
    setCollapsed({ periodId, ids: new Set(doneIds.filter((id) => !fees.has(id))) });
    setShowDone(false);
  } else if ([...collapsed.ids].some((id) => !doneIds.includes(id))) {
    // A visszavont (újra nyitott) számla kikerül: ha megint kifizetik, a helyén marad.
    setCollapsed({ periodId, ids: new Set([...collapsed.ids].filter((id) => doneIds.includes(id))) });
  }
  const hiddenIds = showDone ? new Set<string>() : collapsed.ids;
  const toggleDone = () => {
    if (showDone) setCollapsed({ periodId, ids: new Set(doneIds.filter((id) => !fees.has(id))) });
    setShowDone(!showDone);
  };

  const coverable = coverAllowed(p, data.settings.firstPeriodId);

  const renderCat = (c: Category) => {
    const props = { periodId, cat: c, plan: fig(c).plan, entries: entriesByCat.get(c.id) ?? [], date: entryDate };
    const env = pace.byId.get(c.id);
    return recordStyle(c) === 'fix' ? (
      <FixRow
        key={c.id}
        {...props}
        due={due(c)}
        checkOverdue={checkOverdue(c)}
        today={today}
        goal={c.type === 'megtakaritas' ? goalProgress(c, data, summaries.currentId) : undefined}
        withdrawals={withdrawalsByCat.get(c.id) ?? []}
        fee={fees.get(c.id)}
        onDismissFee={() => dismissFee(c)}
        auto={fig(c).auto}
      />
    ) : (
      <EnvelopeRow
        key={c.id}
        {...props}
        env={env}
        unplanned={pace.unplanned.some((e) => e.cat.id === c.id)}
        cover={coverable && !!env && needsCover(env, pace)}
        allEntries={data.entries}
        open={openId === c.id}
        onToggle={() => setOpenId((id) => (id === c.id ? null : c.id))}
      />
    );
  };

  return (
    <>
      <h1 className="sr-only">Keretek és számlák</h1>
      <div className="page-head">
        <PeriodSwitcher />
        {!unexpectedOpen && (
          <button className="btn" onClick={() => setUnexpectedOpen(true)}>
            <Icon name="alert-triangle" /> Váratlan kiadás
          </button>
        )}
      </div>

      {unexpectedOpen && <UnexpectedExpense key={unexpectedKey} onClose={() => setUnexpectedOpen(false)} />}

      {p.status === 'future' && (
        <div className="callout tone-accent">
          <Icon name="calendar-event" />
          <span className="callout-text">Ez egy jövőbeli hónap. Előre is rögzíthetsz, például ha egy számlát már most kifizettél.</span>
        </div>
      )}
      {p.status === 'closed' && (
        <div className="callout tone-accent">
          <Icon name="lock-open" />
          <span className="callout-text">Lezárt hónap. A módosítás a futó egyenleget is megváltoztatja.</span>
        </div>
      )}

      <RecentEntries />

      <section className="figures" aria-label="A hónap rögzítései">
        <Stat label="Rögzített kiadás" value={formatFt(expActual)} sub={`terv ${formatFt(expPlan)}`} />
        <Stat
          label="Fix számlák"
          value={`${fixDone} / ${dueFixed.length} kifizetve`}
          sub={
            <>
              hátra {formatFt(fixLeft)}
              {overdue > 0 && <span className="neg"> · {overdue} lejárt</span>}
            </>
          }
        />
        <Stat
          label={allowance && allowance.left < 0 ? 'Kereteken túl' : 'Keretekből még elkölthető'}
          value={formatFt(allowance ? Math.abs(allowance.left) : envLeft)}
          valueClass={allowance && allowance.left < 0 ? 'neg' : undefined}
          sub={
            <>
              {allowance && allowance.left > 0 && allowance.perDay !== null && <span className="stat-line">naponta kb. {formatFt(allowance.perDay)}</span>}
              {envNotes.length > 0 ? (
                envNotes.map((n, i) => <span key={i} className="stat-line">{n}</span>)
              ) : (
                <span className="stat-line">minden keret rendben</span>
              )}
            </>
          }
        />
      </section>

      {envelopes.length > 0 && <Section title="Keretek" icon="wallet" hint="koppints a sorra a rögzítéshez">{envelopes.map(renderCat)}</Section>}
      {fixed.length > 0 && (
        <Section title="Fix számlák" icon="receipt" hint="esedékesség szerint">
          {fixed.filter((c) => !hiddenIds.has(c.id)).map(renderCat)}
          {(showDone ? fixDone > 0 : hiddenIds.size > 0) && (
            <button className="rec-more" aria-expanded={showDone} onClick={toggleDone}>
              <Icon name="chevron-right" className={`chev ${showDone ? 'open' : ''}`} />
              <span className="num">{fixDone} / {dueFixed.length} kifizetve</span>
              <span className="faint">· {showDone ? 'elrejt' : 'mutasd'}</span>
            </button>
          )}
        </Section>
      )}
      {savings.length > 0 && <Section title="Megtakarítás" icon="pig-money">{savings.map(renderCat)}</Section>}
      {income.length > 0 && <Section title="Bevételek" icon="cash">{income.map(renderCat)}</Section>}
    </>
  );
}

/** Az időszak kifizetett (lezárt vagy a tervvel egyező) fix számlái. */
function doneFixedIds(data: { categories: Category[] }, p: PeriodSummary): string[] {
  return data.categories
    .filter((c) => c.type === 'fix' && !c.archived)
    .filter((c) => {
      const f = p.byCategory.get(c.id);
      const st = f ? fixStatus(f.plan, f.actual, f.settled) : 'unpaid';
      return st === 'paid' || st === 'paidDiff';
    })
    .map((c) => c.id);
}

function Section({ title, icon, hint, children }: { title: string; icon: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <div className="card-head">
        <h2 className="cluster gap-2">
          <Icon name={icon} style={{ color: 'var(--color-text-subtle)' }} /> {title}
        </h2>
        {hint && <span className="small faint">{hint}</span>}
      </div>
      <div className="rec-list">{children}</div>
    </div>
  );
}

interface RowProps {
  periodId: string;
  cat: Category;
  plan: number;
  entries: Entry[];
  date: ISODate;
}

function FixRow({
  periodId, cat, plan, entries, date, due, checkOverdue, today, goal, withdrawals = [], fee, onDismissFee, auto,
}: RowProps & {
  due: ISODate | null;
  checkOverdue: boolean;
  today: ISODate;
  goal?: GoalProgress;
  withdrawals?: Entry[];
  /** Díjváltozás-javaslat: az új díj, ha a számla a tervtől eltérő összeggel lett kifizetve. */
  fee?: number;
  onDismissFee?: () => void;
  /** Csoportos beszedés: rögzítés nélkül kifizetettnek számít (lásd CategoryFigures.auto). */
  auto?: true;
}) {
  const toast = useToast();
  const rowRef = useRef<HTMLDivElement>(null);
  const feeTextId = useId();
  const safe = useSafe();
  const settleRest = useSettleRest();
  // 'settle': „Más összeg” (lezáró), 'part': „Részlet” (nem lezáró).
  const [editing, setEditing] = useState<'settle' | 'part' | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);
  // A felhasználás melyik kiadási kategória költéseként látszódjon a kimutatásokban (üres: egyik sem).
  const [spendId, setSpendId] = useState('');
  const { data } = useBudget();
  const expenseCats = data.categories.filter((c) => isExpense(c) && !c.archived).sort((a, b) => a.order - b.order);
  const actual = entries.reduce((s, e) => s + e.amount, 0);
  const settled = entries.some((e) => e.settles);
  // Kézi rögzítés nélkül a csoportos beszedés a terv összegével kifizette; a rögzítés felülírja.
  const autoPaid = !!auto && entries.length === 0;
  const status = autoPaid ? 'paid' : fixStatus(plan, actual, settled);
  const done = status === 'paid' || status === 'paidDiff';
  const left = plan - actual;
  const late = checkOverdue && isOverdue(due, today, status);
  const word = PAID_WORD[cat.type];

  // Az AmountInput maga kezeli a hibát (toast, a beírt összeg megmarad), ezért itt nincs safe().
  const record = async (amount: number, settles: boolean, msg: string) => {
    const e = settles ? await addSettlingEntry(periodId, cat.id, amount, date) : await addEntry(periodId, cat.id, amount, date);
    setEditing(null);
    toast(msg, () => restoreEntries([], [e.id]));
  };

  const finish = () =>
    safe(async () => {
      const before = await markSettled(periodId, cat.id);
      if (before) toast(`${cat.name}: kész, ${formatFt(actual)} (terv ${formatFt(plan)})`, () => restoreEntries([before]));
    });

  const withdraw = async (amount: number, note?: string) => {
    const e = await addEntry(periodId, cat.id, amount, date, note, 'withdrawal', false, spendId || undefined);
    setWithdrawing(false);
    toast(`${cat.name}: ${formatFt(amount)} felhasználva`, () => restoreEntries([], [e.id]));
  };

  const removeEntry = (id: string, label: string) =>
    safe(async () => {
      const e = await deleteEntry(id);
      if (e) toast(label, () => restoreEntries([e]));
    });

  const undoAll = () =>
    safe(async () => {
      const old = await clearEntries(periodId, cat.id);
      toast(`${cat.name}: rögzítés törölve`, () => restoreEntries(old));
    });

  // A javaslat a válasz után eltűnik: a fókusz a sorra kerül, ne vesszen el az oldal elejére. Mentés közben a
  // dupla koppintás ne módosítsa kétszer a tervet (a második visszavonása semmit nem állítana vissza).
  const feeBusy = useRef(false);
  const [feePending, setFeePending] = useState(false);
  const acceptFee = async (amount: number) => {
    if (feeBusy.current) return;
    feeBusy.current = true;
    setFeePending(true);
    await safe(async () => {
      const before = await changePlan(cat, periodId, amount, 'from');
      toast(planChangeSummary(before, cat, periodId, amount, 'from'), () => restorePlansOf(cat.id, before));
      rowRef.current?.focus({ preventScroll: true });
    });
    feeBusy.current = false;
    setFeePending(false);
  };
  const rejectFee = () => {
    onDismissFee?.();
    rowRef.current?.focus({ preventScroll: true });
  };

  let text: React.ReactNode;
  if (status === 'unpaid')
    text =
      plan > 0
        ? `terv ${formatFt(plan)}`
        : !isDuePeriod(cat, periodId)
          ? `${cycleLabel(cycleOf(cat))} · legközelebb ${periodName(nextDuePeriod(cat, periodId)).toLowerCase()}`
          : 'nincs tervezett összeg';
  else if (status === 'partial') text = `${formatFt(actual)} / ${formatFt(plan)} · hátra ${formatFt(left)}`;
  else if (autoPaid) text = `Automatikusan kifizetve${due ? ` ${shortDate(due)}` : ''} · ${formatFt(plan)}`;
  else if (status === 'paid') text = `${word} · ${formatFt(actual)}`;
  else if (actual === 0) text = `${word === 'Félretéve' ? 'Nem volt félretétel' : 'Nem volt'} (terv ${formatFt(plan)})`;
  else text = `${word} · ${formatFt(actual)} (terv ${formatFt(plan)})`;

  // A sor eleji pipa a fő művelet: kifizeti (a hátralékot), kifizetettnél visszavonja; terv nélkül az összeget kéri.
  const [checkBusy, setCheckBusy] = useState(false);
  const check = async () => {
    if (checkBusy) return;
    if (!done && left <= 0) {
      setEditing('settle');
      return;
    }
    setCheckBusy(true);
    try {
      if (autoPaid) await safe(() => record(0, true, `${cat.name}: nem volt terhelés`));
      else if (done) await undoAll();
      else
        await safe(async () => {
          await settleRest(periodId, cat, left, date, status === 'partial');
          setEditing(null);
        });
    } finally {
      setCheckBusy(false);
    }
  };
  const checkLabel = autoPaid
    ? `${cat.name}: automatikusan kifizetve – nem volt terhelés`
    : done
      ? `${cat.name}: ${word.toLowerCase()} – visszavonás`
      : left > 0
        ? `${cat.name}: ${settleLabel(cat.type, status === 'partial').toLowerCase()} ${formatFt(left)}`
        : `${cat.name}: összeg megadása`;

  const menu: MenuItem[] = [];
  if (goal && !withdrawing && goal.saved > 0) menu.push({ label: 'Felhasználás', icon: 'arrow-down-right', onSelect: () => setWithdrawing(true) });
  if ((!done && status === 'unpaid') || autoPaid) menu.push({ label: 'Más összeg', icon: 'pencil', onSelect: () => setEditing('settle') });
  if (autoPaid) menu.push({ label: 'Nem volt terhelés', icon: 'ban', onSelect: () => safe(() => record(0, true, `${cat.name}: nem volt terhelés`)) });
  if (!done) menu.push({ label: 'Részlet', icon: 'chart-pie', onSelect: () => setEditing('part') });
  if (status === 'partial') menu.push({ label: 'Kész, több nem lesz', icon: 'flag-check', onSelect: finish });
  if (status !== 'unpaid' && !autoPaid) menu.push({ label: 'Visszavonás', icon: 'arrow-back-up', onSelect: undoAll });
  // Részleges állapotban és több részletnél az egyes rögzítések egyenként is törölhetők.
  const showParts = status === 'partial' || entries.length > 1;

  return (
    <div className={`rec-row ${done ? 'done' : ''}`} id={`cat-${cat.id}`} ref={rowRef} tabIndex={-1}>
      <button
        className={`check-btn ${done ? 'on' : status === 'partial' ? 'part' : late ? 'late' : ''}`}
        aria-label={checkLabel}
        title={checkLabel}
        aria-pressed={done ? true : status === 'partial' ? 'mixed' : false}
        disabled={checkBusy}
        aria-busy={checkBusy}
        onClick={check}
      >
        <span className="check-ring">
          <Icon name={done ? 'check' : status === 'partial' ? 'minus' : 'check'} />
        </span>
      </button>
      <CatIcon cat={cat} />
      <div className="rec-main">
        <div className="rec-name">
          {cat.name}
          {due && !done && (
            <Badge size="sm" tone={late ? 'danger' : 'neutral'}>
              {late ? 'lejárt' : 'esedékes'} {shortDate(due)}
            </Badge>
          )}
        </div>
        <div className={`small num ${done ? 'pos' : 'muted'}`}>
          {text}
          {entries.length > 1 && <span className="faint"> · {entries.length} részletben</span>}
        </div>
      </div>
      {/* A részletek, a díjváltozás, az összegmező és a cél a sor alatt, telefonon teljes szélességben. */}
      <div className="rec-extra">
        {showParts && entries.length > 0 && (
          <div className="pills">
            {entries.map((e) => (
              <span key={e.id} className="badge tone-neutral num" title={e.settles ? 'Ezzel a rögzítéssel a tétel lezárult' : undefined}>
                <span className="faint">{shortDate(e.date)}</span>
                {formatFt(e.amount)}
                {e.note && <span className="faint">· {e.note}</span>}
                {e.settles && <Icon name="lock" className="faint" />}
                <button className="badge-remove" aria-label={`${shortDate(e.date)}: ${formatFt(e.amount)} törlése`} onClick={() => removeEntry(e.id, `${cat.name}: ${formatFt(e.amount)} törölve`)}>
                  <Icon name="x" />
                </button>
              </span>
            ))}
          </div>
        )}
        {fee !== undefined && (
          <div className="fee-suggest" role="group" aria-label={`${cat.name}: díjváltozás`}>
            <Icon name="receipt-refund" className="fee-icon" />
            <span id={feeTextId} className="small num fee-text">{feeSuggestionText(fee)}</span>
            <span className="fee-actions">
              <button className="btn sm primary" aria-describedby={feeTextId} disabled={feePending} aria-busy={feePending} onClick={() => acceptFee(fee)}>
                Igen
              </button>
              <button className="btn sm" aria-describedby={feeTextId} disabled={feePending} onClick={rejectFee}>
                Nem
              </button>
            </span>
          </div>
        )}
        {editing && (
          <div className="mt-2">
            <AmountInput
              key={editing}
              autoFocus
              placeholder={editing === 'part' ? 'Részlet összege' : left > 0 ? String(left) : 'Összeg'}
              buttonLabel={editing === 'part' ? 'Hozzáad' : 'Rögzít'}
              onCancel={() => setEditing(null)}
              onSubmit={(v) =>
                editing === 'part'
                  ? record(v, false, `${cat.name}: részlet ${formatFt(v)}`)
                  : record(v, true, `${cat.name}: ${word.toLowerCase()} ${formatFt(v)}`)
              }
            />
            {editing === 'settle' && <div className="tiny faint mt-1">Ezzel a tétel ebben a hónapban lezárul.</div>}
          </div>
        )}
        {goal && (
          <div className="goal-inline">
            <div className="small num cluster wrap gap-2">
              <span>
                Összegyűlt: <strong>{formatFt(goal.saved)}</strong>
                {goal.target !== null && <span className="faint"> / {formatFt(goal.target)} · {goal.pct}%</span>}
              </span>
              <GoalStateChip state={goal.state} />
            </div>
            {goal.target !== null && (
              <div style={{ margin: '6px 0 4px', maxWidth: 420 }}>
                <Bar value={goal.saved} max={goal.target} tone={goal.state === 'reached' ? 'good' : undefined} color={goal.state === 'reached' ? undefined : cat.color} />
              </div>
            )}
            <div className="tiny muted num">{goalSummary(goal)}</div>
            {withdrawals.length > 0 && (
              <div className="pills">
                {withdrawals.map((w) => (
                  <span key={w.id} className="badge tone-neutral num" title={shortDate(w.date)}>
                    −{formatFt(w.amount)}
                    {w.note && <span className="faint">· {w.note}</span>}
                    <button className="badge-remove" aria-label={`${formatFt(w.amount)} felhasználás törlése`} onClick={() => removeEntry(w.id, 'Felhasználás törölve')}>
                      <Icon name="x" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            {withdrawing && (
              <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
                <label className="small muted cluster wrap gap-2">
                  Mire ment?
                  <select className="sm" value={spendId} onChange={(e) => setSpendId(e.target.value)}>
                    <option value="">Nem számít kiadásnak</option>
                    {expenseCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
                <AmountInput
                  autoFocus
                  withNote
                  placeholder="Felhasznált összeg"
                  buttonLabel="Felhasználás"
                  width={150}
                  onCancel={() => setWithdrawing(false)}
                  validate={(v) => (v > goal.saved ? `Ezen csak ${formatFt(goal.saved)} van` : null)}
                  onSubmit={withdraw}
                />
              </div>
            )}
          </div>
        )}
      </div>
      <div className="rec-actions">
        {menu.length > 0 && !editing && <MenuButton label={`${cat.name}: további műveletek`} items={menu} />}
      </div>
    </div>
  );
}

function EnvelopeRow({
  periodId, cat, plan, entries, date, env, unplanned = false, cover = false, allEntries, open, onToggle,
}: RowProps & {
  env?: EnvelopeStatus;
  unplanned?: boolean;
  /** Kér-e fedezetet a keret, és lehet-e ebben az időszakban áthozni (a folyamatban lévőben és a jövőbeliben). */
  cover?: boolean;
  allEntries: Entry[];
  open: boolean;
  onToggle: () => void;
}) {
  const { openCover } = useBudget();
  const toast = useToast();
  const safe = useSafe();
  const bodyId = useId();
  const statusId = useId();
  const [mode, setMode] = useState<'add' | 'set'>('add');
  const actual = entries.reduce((s, e) => s + e.amount, 0);
  const income = cat.type === 'bevetel';
  // A keret sávja a tempót követi; a részletekben érkező bevételnek nincs tempója.
  const pace = env?.pace ?? 'ok';
  // Csak a kinyitott sor gombjaihoz kell, ezért csak akkor számol.
  const quick = useMemo(() => (open ? suggestedAmounts(allEntries, cat.id, periodId) : []), [open, allEntries, cat.id, periodId]);

  // Becsukáskor a félbehagyott „havi összeg” mód nem marad meg.
  useEffect(() => {
    if (!open) setMode('add');
  }, [open]);

  // Ha az áthozással a keret már nem kér fedezetet, a gomb eltűnik, és a lap bezárásakor visszakapott fókusz vele
  // együtt az oldal elejére esne (az adat jellemzően a bezárás után frissül): ilyenkor a keret neve kapja meg.
  const showCover = open && !income && cover;
  const coverFocus = useRef(false);
  const nameRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (showCover || !coverFocus.current) return;
    coverFocus.current = false;
    // Ha a felhasználó közben máshová lépett, nem rántjuk el a fókuszt.
    if (document.activeElement && document.activeElement !== document.body) return;
    nameRef.current?.focus({ preventScroll: true });
  }, [showCover]);

  const add = async (amount: number, note?: string) => {
    const e = await addEntry(periodId, cat.id, amount, date, note);
    toast(`${cat.name}: +${formatFt(amount)}`, () => restoreEntries([], [e.id]));
  };

  // Mint az összegmezőnél: mentés közben a dupla koppintás ne rögzítsen kétszer.
  const quickBusy = useRef(false);
  const [quickPending, setQuickPending] = useState(false);
  const quickAdd = async (amount: number) => {
    if (quickBusy.current) return;
    quickBusy.current = true;
    setQuickPending(true);
    await safe(() => add(amount));
    quickBusy.current = false;
    setQuickPending(false);
  };

  const setTotal = async (amount: number) => {
    const { old, created } = await setMonthlyTotal(periodId, cat.id, amount, date);
    setMode('add');
    toast(`${cat.name}: havi összeg ${formatFt(amount)}`, () => restoreEntries(old, [created.id]));
  };

  const remove = (id: string) =>
    safe(async () => {
      const e = await deleteEntry(id);
      if (e) toast(`${formatFt(e.amount)} törölve`, () => restoreEntries([e]));
    });

  const status =
    plan === 0 ? (
      actual === 0 ? 'nincs tervezett összeg' : <span className={unplanned ? 'warn-text' : undefined}>nem tervezett · {formatFt(actual)}</span>
    ) : income ? (
      actual >= plan ? 'teljesült' : `még ${formatFt(plan - actual)}`
    ) : (
      envelopeLeftText({ left: plan - actual, perDay: env?.perDay ?? null })
    );

  return (
    <div className={`rec-env ${open ? 'open' : ''}`} id={`cat-${cat.id}`}>
      {/* Az egész fejléc kattintható; a benne lévő gomb a billentyűzetnek és a felolvasónak szól (a kattintása
          ide buborékol, ezért nincs saját kezelője). */}
      <div className="rec-env-head" onClick={onToggle}>
        <CatIcon cat={cat} />
        <div className="rec-env-main">
          <div className="rec-env-line">
            <button ref={nameRef} className="rec-env-name" aria-expanded={open} aria-controls={open ? bodyId : undefined} aria-describedby={statusId}>
              {cat.name}
            </button>
            <span id={statusId} className={`small num ${!income && pace === 'over' ? 'neg' : 'muted'}`}>
              {status}
              {!income && pace === 'fast' && <span className="warn-text"> · gyorsan fogy</span>}
            </span>
          </div>
          {(plan > 0 || actual > 0) && <Bar value={actual} max={plan} tone={income ? 'good' : PACE_TONE[pace]} marker={income ? null : env?.marker} />}
        </div>
        <Icon name="chevron-down" className={`chev ${open ? 'open-down' : ''}`} />
      </div>
      {open && (
        <div id={bodyId} className="rec-env-body">
          <div className="rec-env-sum">
            <span className="small muted num">
              Eddig <strong>{formatFt(actual)}</strong>
              {plan > 0 && <> · {income ? 'terv' : 'keret'}: {formatFt(plan)}</>}
            </span>
            <span className="rec-env-tools">
              {/* Túlfutó vagy terv nélkül költött keretnél: egy másik keret maradéka fedezheti, csak erre a hónapra. */}
              {showCover && (
                <button
                  className="btn sm"
                  aria-label={`${cat.name}: átcsoportosítás másik keretből`}
                  onClick={() => {
                    coverFocus.current = true;
                    openCover(cat.id);
                  }}
                >
                  <Icon name="arrows-exchange" /> Átcsoportosítás
                </button>
              )}
              <MenuButton
                label={`${cat.name}: további műveletek`}
                items={[{ label: 'Havi összeg megadása', icon: 'calendar-stats', onSelect: () => setMode('set') }]}
              />
            </span>
          </div>
          {mode === 'add' ? (
            <div className="rec-env-controls">
              <div className="rec-env-quick">
                {quick.map((q) => (
                  <button
                    key={q}
                    className="btn sm num"
                    aria-label={`${formatFt(q)} hozzáadása`}
                    disabled={quickPending}
                    aria-busy={quickPending}
                    onClick={() => quickAdd(q)}
                  >
                    +{formatFt(q)}
                  </button>
                ))}
              </div>
              <AmountInput noteToggle ariaLabel={`${cat.name}: összeg`} buttonLabel="Hozzáad" onSubmit={add} />
            </div>
          ) : (
            <div className="rec-env-controls">
              <AmountInput
                key="set"
                autoFocus
                initial={actual ? String(actual) : ''}
                placeholder="Teljes havi összeg"
                ariaLabel={`${cat.name}: teljes havi összeg`}
                buttonLabel="Beállít"
                width={160}
                onCancel={() => setMode('add')}
                onSubmit={setTotal}
              />
              <span className="tiny faint">Az eddigi részletek helyére egyetlen havi összeg kerül.</span>
            </div>
          )}
          {mode === 'add' && entries.length > 0 && (
            <div className="pills">
              {entries.map((e) => (
                <span key={e.id} className="badge tone-neutral num" title={`${shortDate(e.date)}${e.note ? ` · ${e.note}` : ''}`}>
                  {formatFt(e.amount)}
                  {e.note && <span className="faint">· {e.note}</span>}
                  <button className="badge-remove" aria-label={`${formatFt(e.amount)} törlése`} onClick={() => remove(e.id)}>
                    <Icon name="x" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Az utolsó 10 rögzítés minden kategóriából és időszakból, összecsukható listában, egyenként törölhetően. */
function RecentEntries() {
  const { data, summaries, today } = useBudget();
  const toast = useToast();
  const safe = useSafe();
  const [open, setOpen] = useLocalState('recent-open', false);
  const listId = useId();
  const list = useMemo(() => recentEntries(data.entries), [data.entries]);
  const cats = useMemo(() => new Map(data.categories.map((c) => [c.id, c])), [data.categories]);
  if (list.length === 0) return null;

  const remove = (e: Entry, name: string) =>
    safe(async () => {
      const old = await deleteEntry(e.id);
      if (old) toast(`${name}: ${formatFt(old.amount)} törölve`, () => restoreEntries([old]));
    });

  return (
    <section className="card recent">
      <button className="recent-toggle" aria-expanded={open} aria-controls={open ? listId : undefined} onClick={() => setOpen(!open)}>
        <Icon name="history" className="faint" />
        <span className="recent-title">Legutóbbi rögzítések</span>
        <span className="tiny faint">{recordedAtText(list[0].createdAt, today)}</span>
        <Icon name="chevron-down" className={`chev ${open ? 'open-down' : ''}`} />
      </button>
      {open && (
        <ul id={listId} className="recent-list">
          {list.map((e) => {
            const c = cats.get(e.categoryId);
            const name = c?.name ?? 'Ismeretlen kategória';
            const sign = e.kind === 'withdrawal' ? '−' : c?.type === 'bevetel' ? '+' : '';
            return (
              <li key={e.id} className="recent-row">
                <CatIcon cat={c ?? { icon: 'question-mark', color: '#8a8983' }} />
                <div className="recent-main">
                  <div className="small recent-name">
                    {name}
                    {e.note && <span className="muted"> · {e.note}</span>}
                  </div>
                  <div className="tiny faint">
                    {recordedAtText(e.createdAt, today)}
                    {e.createdBy && ` · ${e.createdBy}`}
                    {e.kind === 'withdrawal' && ' · felhasználás'}
                    {e.settles && ' · lezárva'}
                    {e.periodId !== summaries.currentId && ` · ${periodName(e.periodId)} hónap`}
                  </div>
                </div>
                <span className={`small num ${sign === '+' ? 'pos' : ''}`}>
                  {sign}
                  {formatFt(e.amount)}
                </span>
                <button className="btn sm ghost icon" aria-label={`${name}: ${formatFt(e.amount)} törlése`} onClick={() => remove(e, name)}>
                  <Icon name="trash" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
