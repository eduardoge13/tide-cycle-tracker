import { useState } from 'react';
import { formatDate } from '../lib/dates';
import type { CycleSample } from '../lib/prediction';

/**
 * Vertical bars, one per cycle (oldest → newest). Single series, so no legend
 * box: outliers carry a hatch texture + "unusual" in the tooltip; excluded
 * gaps are drawn as hollow bars. A dashed line marks the median.
 */
export function CycleChart({ samples, average }: { samples: readonly CycleSample[]; average: number | null }) {
  const [active, setActive] = useState<number | null>(null);
  const shown = samples.slice(-12);
  const W = 340;
  const H = 180;
  const pad = { top: 16, right: 8, bottom: 26, left: 30 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const maxLen = Math.max(40, ...shown.map((s) => Math.min(s.length, 90)));
  const minLen = 0;
  const y = (v: number) => pad.top + innerH - ((Math.min(v, maxLen) - minLen) / (maxLen - minLen)) * innerH;
  const slot = innerW / Math.max(shown.length, 1);
  const barW = Math.min(22, slot - 4);
  const ticks = [0, 14, 28, Math.round(maxLen / 7) * 7].filter((v, i, a) => a.indexOf(v) === i && v <= maxLen);
  const act = active !== null ? shown[active] : undefined;

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={`Gráfica de barras de tus últimos ${shown.length} ciclos`}>
        <defs>
          <pattern id="hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="5" height="5" className="hatch-bg" />
            <line x1="0" y1="0" x2="0" y2="5" className="hatch-line" strokeWidth="2.2" />
          </pattern>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={W - pad.right} y1={y(t)} y2={y(t)} className="grid" />
            <text x={pad.left - 6} y={y(t) + 4} className="axis" textAnchor="end">
              {t}
            </text>
          </g>
        ))}
        {shown.map((s, i) => {
          const x = pad.left + i * slot + (slot - barW) / 2;
          const top = y(s.length);
          const h = Math.max(2, pad.top + innerH - top);
          const r = Math.min(4, barW / 2);
          // Rounded top only, anchored square to the baseline.
          const d = `M${x},${top + h} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${top + h} Z`;
          const cls = !s.included ? 'bar bar-excluded' : s.outlier ? 'bar bar-outlier' : 'bar';
          return (
            <g key={s.start + s.nextStart}>
              <path d={d} className={`${cls} ${active === i ? 'is-active' : ''}`} />
              {/* Larger invisible hit target for touch */}
              <rect
                x={pad.left + i * slot}
                y={pad.top}
                width={slot}
                height={innerH + pad.bottom}
                fill="transparent"
                tabIndex={0}
                role="button"
                aria-label={`Ciclo desde el ${formatDate(s.start)}: ${s.length} días${s.outlier ? ', inusual' : ''}${!s.included ? ', no se usa para estimar' : ''}`}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                onClick={() => setActive(active === i ? null : i)}
              />
              {(i === 0 || i === shown.length - 1) && (
                <text x={x + barW / 2} y={H - 8} className="axis" textAnchor="middle">
                  {formatDate(s.start, { month: 'short' })}
                </text>
              )}
            </g>
          );
        })}
        {average !== null && (
          <g>
            <line x1={pad.left} x2={W - pad.right} y1={y(average)} y2={y(average)} className="avg-line" />
            <text x={W - pad.right} y={y(average) - 5} className="axis axis-strong" textAnchor="end">
              mediana {average}
            </text>
          </g>
        )}
      </svg>
      <div className="chart-tip" aria-live="polite">
        {act ? (
          <>
            <strong>{act.length} días</strong> · desde el {formatDate(act.start, { month: 'short', day: 'numeric', year: 'numeric' })}
            {act.outlier && ' · inusual'}
            {!act.included && ' · no se usa para estimar'}
          </>
        ) : (
          <span className="muted">Toca una barra para ver detalles.</span>
        )}
      </div>
    </div>
  );
}
