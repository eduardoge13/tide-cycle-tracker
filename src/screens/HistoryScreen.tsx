import { useState } from 'react';
import { diffDays, formatDate } from '../lib/dates';
import { useNav } from '../lib/nav';
import { useStore } from '../lib/store';
import { FLOW_LABEL, type PeriodEntry } from '../lib/types';
import { PeriodForm } from '../components/PeriodForm';
import { Card, ConfirmDialog, EmptyState, Icon, ScreenHeader } from '../components/ui';

export function HistoryScreen({ adding: startAdding = false }: { adding?: boolean }) {
  const { data, prediction, addPeriod, deletePeriod } = useStore();
  const { go, notify } = useNav();
  const [adding, setAdding] = useState(startAdding);
  const [toDelete, setToDelete] = useState<PeriodEntry | null>(null);

  const sorted = [...data.periods].sort((a, b) => (a.start < b.start ? 1 : -1));
  const lengthByStart = new Map(prediction.samples.map((s) => [s.start, s]));

  return (
    <div className="screen">
      <ScreenHeader
        title="Historial"
        subtitle={`${data.periods.length} registro${data.periods.length === 1 ? '' : 's'}`}
        action={
          !adding && (
            <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
              <Icon name="plus" size={18} /> Agregar anterior
            </button>
          )
        }
      />

      {adding && (
        <Card>
          <h2 className="h-card">Agregar un periodo anterior</h2>
          <p className="muted small">
            Agrega todos los que recuerdes, en el orden que sea. Usa “Guardar y agregar otro” para seguir.
          </p>
          <PeriodForm
            variant="history"
            initialStart=""
            submitLabel="Guardar"
            onCancel={() => setAdding(false)}
            onEditExisting={(id) => go({ name: 'log', tab: 'period', editId: id })}
            onSaved={(input, { addAnother }) => {
              addPeriod(input);
              notify(`Agregado: ${input.kind === 'period' ? 'periodo' : 'manchado'} del ${formatDate(input.start, { month: 'short', day: 'numeric', year: 'numeric' })}.`);
              if (!addAnother) setAdding(false);
            }}
          />
        </Card>
      )}

      {sorted.length === 0 && !adding ? (
        <EmptyState
          title="Aún no hay periodos"
          action={
            <button className="btn btn-primary" onClick={() => setAdding(true)}>
              Agregar tu primer periodo
            </button>
          }
        >
          Con dos o tres periodos anteriores, la app deja de usar el promedio de 28 días y estima con tus propios ciclos.
        </EmptyState>
      ) : (
        <ul className="history-list">
          {sorted.map((p) => {
            const sample = p.kind === 'period' ? lengthByStart.get(p.start) : undefined;
            const duration = p.end ? diffDays(p.start, p.end) + 1 : null;
            return (
              <li key={p.id} className={`history-item kind-${p.kind}`}>
                <span className="hi-mark" aria-hidden />
                <div className="hi-body">
                  <p className="hi-title">
                    {formatDate(p.start, { month: 'short', day: 'numeric', year: 'numeric' })}
                    {p.end && p.end !== p.start ? ` – ${formatDate(p.end)}` : ''}
                  </p>
                  <p className="muted small">
                    {p.kind === 'period' ? 'Periodo' : 'Manchado'} · {FLOW_LABEL[p.flow]}
                    {duration ? ` · ${duration} día${duration === 1 ? '' : 's'}` : ' · sin fecha de fin'}
                    {sample && sample.included && ` · ciclo de ${sample.length} días`}
                    {sample?.outlier && ' (inusual)'}
                    {sample && !sample.included && ` · ${sample.length} días de separación, no se usa para estimar`}
                  </p>
                  {p.notes && <p className="hi-notes">{p.notes}</p>}
                </div>
                <div className="hi-actions">
                  <button className="icon-btn" aria-label={`Editar registro del ${formatDate(p.start)}`} onClick={() => go({ name: 'log', tab: 'period', editId: p.id })}>
                    <Icon name="edit" size={20} />
                  </button>
                  <button className="icon-btn danger" aria-label={`Borrar registro del ${formatDate(p.start)}`} onClick={() => setToDelete(p)}>
                    <Icon name="trash" size={20} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        title="¿Borrar este registro?"
        confirmLabel="Borrar"
        destructive
        onCancel={() => setToDelete(null)}
        onConfirm={() => {
          if (toDelete) deletePeriod(toDelete.id);
          setToDelete(null);
          notify('Registro borrado. Estimaciones actualizadas.');
        }}
      >
        {toDelete && `El ${toDelete.kind === 'period' ? 'periodo' : 'manchado'} del ${formatDate(toDelete.start)} se borrará de este teléfono.`}
      </ConfirmDialog>
    </div>
  );
}
