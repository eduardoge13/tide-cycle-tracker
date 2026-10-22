/**
 * A quiet progress ring: the solid arc is days elapsed, the berry segment at
 * the start is the period, and the dashed tail marks the estimated end.
 */
export function CycleRing({ day, length, periodLength, late }: { day: number; length: number; periodLength: number; late: boolean }) {
  const size = 148;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const total = Math.max(length, day);
  const frac = (n: number) => Math.min(1, Math.max(0, n / total));
  const periodArc = frac(periodLength) * c;
  const elapsedArc = frac(day) * c;

  return (
    <div className="ring" role="img" aria-label={`Día ${day} del ciclo, de unos ${length}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`} fill="none" strokeWidth={stroke} strokeLinecap="round">
          <circle className="ring-track" cx={size / 2} cy={size / 2} r={r} strokeDasharray="2 6" />
          <circle className="ring-elapsed" cx={size / 2} cy={size / 2} r={r} strokeDasharray={`${elapsedArc} ${c}`} />
          <circle className="ring-period" cx={size / 2} cy={size / 2} r={r} strokeDasharray={`${periodArc} ${c}`} />
        </g>
      </svg>
      <div className="ring-label">
        <span className="ring-day">{day}</span>
        <span className="ring-caption">{late ? 'días' : `de ~${length}`}</span>
      </div>
    </div>
  );
}
