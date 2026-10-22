import { useState } from 'react';
import { formatDate } from '../lib/dates';
import { computeStats } from '../lib/stats';
import { useNav } from '../lib/nav';
import { useStore } from '../lib/store';
import { CycleChart } from '../components/CycleChart';
import { Card, ConfidenceBadge, EmptyState, ScreenHeader } from '../components/ui';

const fmt = (n: number | null, unit = 'días') => (n === null ? '—' : `${n} ${unit}`);

export function StatsScreen() {
  const { data, prediction } = useStore();
  const { go } = useNav();
  const [showTable, setShowTable] = useState(false);
  const stats = computeStats(prediction.samples, data.periods);
  const samples = prediction.samples;

  if (samples.length === 0) {
    return (
      <div className="screen">
        <ScreenHeader title="Resumen" />
        <EmptyState
          title="Todavía faltan datos"
          action={
            <button className="btn btn-primary" onClick={() => go({ name: 'history', adding: true })}>
              Agregar periodos anteriores
            </button>
          }
        >
          El resumen aparece cuando hay al menos dos inicios de periodo. Todo se calcula en este teléfono.
        </EmptyState>
      </div>
    );
  }

  const checks = data.predictionChecks;
  const inRange = checks.filter((c) => c.withinRange).length;

  return (
    <div className="screen">
      <ScreenHeader title="Resumen" subtitle="Calculado solo en este teléfono." />

      <div className="stat-grid">
        <Stat label="Ciclo promedio" value={fmt(stats.averageCycle)} />
        <Stat label="Ciclo mediano" value={fmt(stats.medianCycle)} />
        <Stat label="Periodo promedio" value={fmt(stats.averagePeriod)} sub={stats.periodsWithEnd ? `de ${stats.periodsWithEnd} con fecha de fin` : 'agrega fechas de fin para verlo'} />
        <Stat label="Ciclos registrados" value={String(stats.cyclesTracked)} />
        <Stat label="Más corto" value={fmt(stats.shortest?.length ?? null)} sub={stats.shortest ? `desde el ${formatDate(stats.shortest.start)}` : undefined} />
        <Stat label="Más largo" value={fmt(stats.longest?.length ?? null)} sub={stats.longest ? `desde el ${formatDate(stats.longest.start)}` : undefined} />
      </div>

      <Card>
        <div className="row-between">
          <h2 className="h-card">Duración de tus ciclos</h2>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowTable((v) => !v)} aria-pressed={showTable}>
            {showTable ? 'Ver gráfica' : 'Ver tabla'}
          </button>
        </div>
        {stats.trend && (
          <p className="muted small">
            Tendencia reciente:{' '}
            <strong>
              {stats.trend === 'stable'
                ? 'bastante estable'
                : `los últimos 3 ciclos duran ${Math.abs(stats.trendDelta!)} días ${stats.trend === 'shorter' ? 'menos' : 'más'} en promedio que los 3 anteriores`}
            </strong>
          </p>
        )}
        {showTable ? (
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Ciclo desde</th>
                <th scope="col">Duración</th>
                <th scope="col">Nota</th>
              </tr>
            </thead>
            <tbody>
              {[...samples].reverse().map((s) => (
                <tr key={s.start + s.nextStart}>
                  <td>{formatDate(s.start, { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                  <td>{s.length} días</td>
                  <td className="muted">
                    {!s.included ? (s.excludedReason === 'too-long' ? 'Separación larga, no se usa' : 'Muy corto, no se usa') : s.outlier ? 'Inusual, pesa menos' : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <CycleChart samples={samples} average={stats.medianCycle} />
        )}
        <p className="muted small">
          Los ciclos inusuales aparecen con rayas. Sí cuentan, pero pesan menos, para que un mes raro no descomponga la
          estimación. Las separaciones de más de 90 días casi siempre son un registro olvidado y no se usan.
        </p>
      </Card>

      <Card>
        <h2 className="h-card">Calidad de la estimación</h2>
        <div className="row-between">
          <ConfidenceBadge level={prediction.confidence} />
          <span className="muted small">rango de ± {prediction.halfWidth} días</span>
        </div>
        <p className="muted small">
          {prediction.method === 'default'
            ? 'Se usa la duración promedio hasta tener dos ciclos completos.'
            : prediction.method === 'median'
              ? `Mediana de tus ${prediction.cyclesUsed} ciclos registrados. Variación: unos ±${prediction.variability} días.`
              : `Pesan más tus 6 ciclos más recientes. Variación: unos ±${prediction.variability} días.`}
        </p>
        {checks.length > 0 && (
          <p className="small">
            {inRange} de {checks.length} periodo{checks.length === 1 ? '' : 's'} llegaron dentro del rango estimado.
          </p>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="stat">
      <p className="stat-label">{label}</p>
      <p className="stat-value">{value}</p>
      {sub && <p className="stat-sub">{sub}</p>}
    </div>
  );
}
