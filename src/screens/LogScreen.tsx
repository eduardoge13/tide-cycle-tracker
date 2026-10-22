import { useState } from 'react';
import { formatDate, formatRange, isValidISODate } from '../lib/dates';
import { useNav } from '../lib/nav';
import { useStore } from '../lib/store';
import { DayLogForm } from '../components/DayLogForm';
import { PeriodForm } from '../components/PeriodForm';
import { ConfirmDialog, ScreenHeader } from '../components/ui';

export function LogScreen({ tab, editId, date }: { tab: 'period' | 'day'; editId?: string; date?: string }) {
  const { data, today, addPeriod, updatePeriod, deletePeriod } = useStore();
  const { go, notify } = useNav();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const editing = editId ? data.periods.find((p) => p.id === editId) : undefined;
  const dayDate = date && isValidISODate(date) && date <= today ? date : today;

  return (
    <div className="screen">
      <ScreenHeader title={editing ? 'Editar registro' : tab === 'period' ? 'Registrar periodo' : 'Cómo me siento'} />

      {!editing && (
        <div className="segmented tabs" role="tablist" aria-label="Qué registrar">
          <button role="tab" aria-selected={tab === 'period'} className={tab === 'period' ? 'on' : ''} onClick={() => go({ name: 'log', tab: 'period' })}>
            Periodo
          </button>
          <button role="tab" aria-selected={tab === 'day'} className={tab === 'day' ? 'on' : ''} onClick={() => go({ name: 'log', tab: 'day', date: dayDate })}>
            Síntomas y ánimo
          </button>
        </div>
      )}

      <div className="card">
        {tab === 'period' || editing ? (
          <PeriodForm
            key={editing?.id ?? 'new'}
            entry={editing}
            initialStart={date}
            onEditExisting={(id) => go({ name: 'log', tab: 'period', editId: id })}
            onCancel={editing ? () => go({ name: 'history' }) : undefined}
            onSaved={(input, { logSymptoms }) => {
              if (editing) {
                updatePeriod(editing.id, input);
                notify('Cambios guardados. Estimaciones actualizadas.');
                go({ name: 'history' });
                return;
              }
              const { check } = addPeriod(input);
              if (check) {
                const off = Math.abs(check.errorDays);
                notify(
                  check.errorDays === 0
                    ? 'Guardado. Llegó justo el día estimado.'
                    : `Guardado. Llegó ${off} día${off === 1 ? '' : 's'} ${check.errorDays > 0 ? 'después' : 'antes'} de lo estimado (${formatRange(check.rangeStart, check.rangeEnd)}).`,
                );
              } else {
                notify(input.kind === 'spotting' ? 'Manchado guardado.' : `Periodo del ${formatDate(input.start)} guardado. Estimaciones actualizadas.`);
              }
              go(logSymptoms ? { name: 'log', tab: 'day', date: input.start } : { name: 'today' });
            }}
          />
        ) : (
          <DayLogForm
            date={dayDate}
            onDone={(saved) => {
              notify(saved ? 'Guardado para el ' + formatDate(dayDate) + '.' : 'No se guardó nada para ese día.');
              go({ name: 'today' });
            }}
          />
        )}
      </div>

      {tab === 'day' && !editing && (
        <div className="day-picker">
          <label htmlFor="day-date" className="field-label">
            Registrar otro día
          </label>
          <input
            id="day-date"
            type="date"
            max={today}
            value={dayDate}
            onChange={(e) => e.target.value && go({ name: 'log', tab: 'day', date: e.target.value })}
          />
        </div>
      )}

      {editing && (
        <>
          <button className="btn btn-danger-ghost full" onClick={() => setConfirmDelete(true)}>
            Borrar este registro
          </button>
          <ConfirmDialog
            open={confirmDelete}
            title="¿Borrar este registro?"
            confirmLabel="Borrar"
            destructive
            onCancel={() => setConfirmDelete(false)}
            onConfirm={() => {
              deletePeriod(editing.id);
              setConfirmDelete(false);
              notify('Registro borrado. Estimaciones actualizadas.');
              go({ name: 'history' });
            }}
          >
            El {editing.kind === 'period' ? 'periodo' : 'manchado'} del {formatDate(editing.start)} se borrará de este teléfono.
          </ConfirmDialog>
        </>
      )}
    </div>
  );
}
