import type { PeriodSummary } from '../../domain/balance';
import { formatFt, formatSigned } from '../../domain/money';
import { closingSentence, daysLeftText, noDailyPlanText, overspentText, paceStatus, startsInText, type PaceOverview } from '../../domain/pace';
import { useBudget } from '../context';
import { Icon } from './common';

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
export function Hero({ p, pace }: { p: PeriodSummary; pace: PaceOverview }) {
  const { today } = useBudget();

  if (p.status !== 'current') {
    const closed = p.status === 'closed';
    return (
      <section className="card hero" aria-label={closed ? 'Az időszak zárása' : 'Az időszak terve'}>
        <div className="hero-main">
          <p className="hero-label">{closed ? 'Lezárt időszak' : 'Terv'}</p>
          <p className="hero-title num">
            {closed ? closingSentence(p.net) : `Tervezett havi egyenleg: ${formatSigned(p.net)}`}
          </p>
          <p className="hero-sub num">{totalsLine(p)}</p>
          {!closed && <p className="hero-sub">{startsInText(p.start, today)}</p>}
        </div>
      </section>
    );
  }

  const { allowance, days, flagged, hasDailyPlan } = pace;
  const over = allowance.left < 0;
  const daysText = daysLeftText(days, p.end);
  const status = paceStatus(pace);
  const icon =
    status.tone === 'ok' ? 'circle-check' : status.tone === 'over' ? 'alert-triangle' : flagged.length > 0 ? 'trending-up' : 'alert-circle';

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
          {daysText}
          {allowance.perDay !== null && days.remaining > 1 && ` · naponta ~${formatFt(allowance.perDay)}`}
        </p>
      </>
    );
  }

  return (
    <section className="card hero" aria-label="Az időszak állása">
      <div className="hero-main">{main}</div>
      {/* Keretterv nélkül a „terv szerint haladtok” félrevezető lenne; csak a túllépés jelenik meg. */}
      {(hasDailyPlan || status.tone !== 'ok') && (
        <div className={`hero-status ${status.tone}`}>
          <Icon name={icon} />
          <div>
            <p className="num">{status.text}</p>
            {status.more > 0 && <p className="tiny">és még {status.more} keret figyelmet kér</p>}
          </div>
        </div>
      )}
    </section>
  );
}
