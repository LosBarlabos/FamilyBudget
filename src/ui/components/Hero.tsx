import type { PeriodSummary } from '../../domain/balance';
import { formatFt, formatSigned } from '../../domain/money';
import { closingSentence, daysLeftText, noDailyPlanText, overspentText, paceStatus, startsInText, type PaceOverview } from '../../domain/pace';
import { useBudget } from '../context';
import { Bar, Icon, PACE_TONE } from './common';

/** „Bevétel 520 000 Ft · kiadás 410 000 Ft · félretéve 60 000 Ft” */
function totalsLine(p: PeriodSummary): string {
  const parts = [`Bevétel ${formatFt(p.income)}`, `kiadás ${formatFt(p.expense)}`];
  if (p.savings > 0) parts.push(`félretéve ${formatFt(p.savings)}`);
  return parts.join(' · ');
}

/**
 * „Jól állunk-e?” – az Áttekintés teteje. A folyamatban lévő időszakban a keretekből még elkölthető összeg,
 * a napi összeg és egy állapotmondat; lezárt időszakban a zárómondat, jövőbeliben a terv összegzése.
 */
export interface HeroStat {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
}

/**
 * „Jól állunk-e?” – az Áttekintés teteje, a képernyő egyetlen kiemelt kártyája. A folyamatban lévő időszakban
 * a keretekből még elkölthető összeg, a napi összeg, a keretek fogyása az eltelt időhöz mérve és a bevétel /
 * kiadás / félretétel eddigi állása; a figyelmet kérő keret külön sávban alatta. Lezárt időszakban a zárómondat,
 * jövőbeliben a terv összegzése.
 */
export function Hero({ p, pace, stats = [] }: { p: PeriodSummary; pace: PaceOverview; stats?: HeroStat[] }) {
  const { today, go } = useBudget();

  if (p.status !== 'current') {
    const closed = p.status === 'closed';
    return (
      <section className="hero" aria-label={closed ? 'A hónap zárása' : 'A hónap terve'}>
        <p className="hero-label">{closed ? 'Lezárt hónap' : 'Előre tervezett hónap'}</p>
        <p className="hero-title num">
          {closed ? closingSentence(p.net) : `Tervezett havi egyenleg: ${formatSigned(p.net)}`}
        </p>
        <p className="hero-sub num">{totalsLine(p)}</p>
        {!closed && <p className="hero-sub">{startsInText(p.start, today)}</p>}
      </section>
    );
  }

  const { allowance, days, flagged, hasDailyPlan } = pace;
  const over = allowance.left < 0;
  const daysText = daysLeftText(days, p.end);
  const status = paceStatus(pace);
  const icon = status.tone === 'over' ? 'alert-triangle' : flagged.length > 0 ? 'trending-up' : 'alert-circle';
  // A sáv a napi összegbe számító keretekből eddig elköltött rész; a jelölő az időszakból eltelt idő.
  const spent = allowance.plan - allowance.left;
  const spentPct = allowance.plan > 0 ? Math.round((spent / allowance.plan) * 100) : 0;
  const worst = flagged[0]?.cat ?? pace.unplanned[0]?.cat;

  let main: React.ReactNode;
  if (!hasDailyPlan) {
    // Pl. az első költségvetési időszak előtt nincs keretterv, vagy van, de nem a napi összegbe számító
    // kereteknél: ilyenkor csak a keretek eddigi költése látszik, és az, hogy miért nincs napi összeg.
    main = (
      <>
        <p className="hero-label">Keretekből eddig</p>
        <p className="hero-value num">{formatFt(pace.envelopes.reduce((s, e) => s + e.actual, 0))}</p>
        <p className="hero-sub">
          {daysText} · {noDailyPlanText(pace)}
        </p>
      </>
    );
  } else if (over) {
    main = (
      <>
        <p className="hero-label">Kereteken túl</p>
        <p className="hero-value num neg">{formatFt(-allowance.left)}</p>
        <p className="hero-sub num">{overspentText(allowance.left)} · {daysText}</p>
      </>
    );
  } else {
    main = (
      <>
        <p className="hero-label">Még elkölthető</p>
        <p className="hero-value num">{formatFt(allowance.left)}</p>
        <p className="hero-sub num">
          {allowance.perDay !== null && days.remaining > 1 && (
            <>
              naponta ~<strong>{formatFt(allowance.perDay)}</strong> ·{' '}
            </>
          )}
          {daysText}
        </p>
      </>
    );
  }

  return (
    <>
      <section className="hero" aria-label="A hónap állása">
        {main}
        {hasDailyPlan && (
          <div className="hero-meter">
            <Bar
              value={spent}
              max={allowance.plan}
              tone={status.tone === 'ok' ? 'accent' : PACE_TONE[status.tone === 'over' ? 'over' : 'fast']}
              marker={days.ratio}
            />
            <p className="hero-meter-text num">
              <span>keretekből {spentPct}% elment</span>
              <span>a hónap {Math.round(days.ratio * 100)}%-ánál</span>
            </p>
          </div>
        )}
        {hasDailyPlan && status.tone === 'ok' && (
          <p className="hero-ok">
            <Icon name="circle-check" /> {status.text}
          </p>
        )}
        {stats.length > 0 && (
          <dl className="hero-stats">
            {stats.map((st) => (
              <div key={st.label}>
                <dt>{st.label}</dt>
                <dd className={`num ${st.valueClass ?? ''}`}>{st.value}</dd>
                {st.sub && <dd className="hero-stat-sub num">{st.sub}</dd>}
              </div>
            ))}
          </dl>
        )}
      </section>
      {/* Keretterv nélkül a „minden keret a terv szerint halad” félrevezető lenne; csak a túllépés jelenik meg. */}
      {status.tone !== 'ok' && (
        <button
          className={`hero-alert ${status.tone}`}
          onClick={() => worst && go('record', worst.id)}
          disabled={!worst}
          aria-label={`${status.text}${status.more > 0 ? `, és még ${status.more} keret figyelmet kér` : ''}. Megnyitás a Rögzítésben`}
        >
          <span className="hero-alert-icon">
            <Icon name={icon} />
          </span>
          <span className="hero-alert-text num">
            {status.text}
            {status.more > 0 && <span className="tiny">és még {status.more} keret figyelmet kér</span>}
          </span>
          <Icon name="chevron-right" />
        </button>
      )}
    </>
  );
}
