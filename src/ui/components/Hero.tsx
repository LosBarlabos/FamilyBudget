import type { PeriodSummary } from '../../domain/balance';
import { formatFt, formatSigned } from '../../domain/money';
import { allowanceLine, monthStrip, remainingText } from '../../domain/overview';
import { closingSentence, noDailyPlanText, overspentText, startsInText, type PaceOverview } from '../../domain/pace';
import { useBudget } from '../context';
import { MonthStrip } from './MonthStrip';

/** „Bevétel 520 000 Ft · kiadás 410 000 Ft · félretéve 60 000 Ft” */
function totalsLine(p: PeriodSummary): string {
  const parts = [`Bevétel ${formatFt(p.income)}`, `kiadás ${formatFt(p.expense)}`];
  if (p.savings > 0) parts.push(`félretéve ${formatFt(p.savings)}`);
  return parts.join(' · ');
}

/**
 * „Jól állunk-e?” – az Áttekintés teteje, a képernyő egyetlen kiemelt kártyája. A folyamatban lévő időszakban
 * a keretekből még elkölthető összeg, a napi összeg és a hónapcsík a mondatával. A figyelmet kérő keretek a
 * teendők között állnak, egyszer. Lezárt időszakban a zárómondat, jövőbeliben a terv összegzése.
 */
export function Hero({ p, pace }: { p: PeriodSummary; pace: PaceOverview }) {
  const { today } = useBudget();

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

  const { allowance, days, hasDailyPlan } = pace;
  const left = remainingText(days, p.end);
  const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1) + '.';

  let main: React.ReactNode;
  if (!hasDailyPlan) {
    // Pl. az első költségvetési időszak előtt nincs keretterv, vagy van, de nem a napi összegbe számító
    // kereteknél: ilyenkor csak a keretek eddigi költése látszik, és az, hogy miért nincs napi összeg.
    main = (
      <>
        <p className="hero-label">Keretekből eddig</p>
        <p className="hero-value num">{formatFt(pace.envelopes.reduce((s, e) => s + e.actual, 0))}</p>
        <p className="hero-sub">
          {sentence(left)} {noDailyPlanText(pace)}
        </p>
      </>
    );
  } else if (allowance.left < 0) {
    main = (
      <>
        <p className="hero-label">Kereteken túl</p>
        <p className="hero-value num neg">{formatFt(-allowance.left)}</p>
        <p className="hero-sub num">
          {overspentText(allowance.left)}, {left}.
        </p>
      </>
    );
  } else {
    const line = allowanceLine(allowance.perDay, days, p.end);
    main = (
      <>
        <p className="hero-label">Még elkölthető a keretekből</p>
        <p className="hero-value num">{formatFt(allowance.left)}</p>
        <p className="hero-sub num">
          {line ? (
            <>
              {line.lead}
              <strong>{line.amount}</strong>
              {line.tail}
            </>
          ) : (
            sentence(left)
          )}
        </p>
      </>
    );
  }

  return (
    <section className="hero" aria-label="A hónap állása">
      {main}
      {hasDailyPlan && <MonthStrip strip={monthStrip(p, pace)} days={days} />}
    </section>
  );
}
