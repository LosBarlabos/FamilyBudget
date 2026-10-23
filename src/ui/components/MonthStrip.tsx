import { stripDescription, stripSentence, type MonthStrip as Strip } from '../../domain/overview';
import type { PeriodDays } from '../../domain/pace';
import { shortDate } from '../../domain/periods';

/**
 * A Csekk hónapcsíkja: a hónap napjai oszlopként, az eltelt napok teli, a mai bekarikázva, és ahol a költés
 * előrébb jár az időnél, ott sávozott borostyán. Alatta a dátumok és egy mondat, amely ugyanezt kimondja.
 */
export function MonthStrip({ strip, days }: { strip: Strip; days: PeriodDays }) {
  const sentence = stripSentence(strip);
  const last = strip.days.length - 1;
  const today = strip.days.findIndex((d) => d.state === 'today');
  // A szélső dátumok csak akkor, ha nem csúsznak rá a „ma” feliratra; a hónap elseje csak széles helyen.
  const labels = strip.days.flatMap((d, i) => {
    if (i === today) return [{ i, text: 'ma', cls: 'strip-today' }];
    if (i === 0 && today > 3) return [{ i, text: shortDate(d.date), cls: 'strip-first' }];
    if (i === last && today < last - 4) return [{ i, text: shortDate(d.date), cls: 'strip-last' }];
    if (i > 0 && d.date.endsWith('-01') && Math.abs(i - today) > 4 && i < last - 4) return [{ i, text: shortDate(d.date), cls: 'strip-extra' }];
    return [];
  });
  return (
    <div className="strip">
      <div className="strip-days" role="img" aria-label={stripDescription(strip, days)} style={{ '--n': strip.days.length } as React.CSSProperties}>
        {strip.days.map((d) => (
          <span key={d.date} className={`strip-day ${d.state}${d.weekend ? ' weekend' : ''}`} />
        ))}
      </div>
      <div className="strip-labels num" aria-hidden="true" style={{ '--n': strip.days.length } as React.CSSProperties}>
        {labels.map((l) => (
          <span key={l.i} className={l.cls} style={{ gridColumn: l.i + 1 }}>
            {l.text}
          </span>
        ))}
      </div>
      <p className={`strip-text ${sentence.tone}`}>
        <strong>{sentence.strong}</strong> {sentence.rest}
      </p>
    </div>
  );
}
