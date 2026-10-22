import { useMemo, useState } from 'react';
import { useStore, type PeriodInput } from '../lib/store';
import { checkEntry, MAX_NOTES } from '../lib/validation';
import type { EntryKind, FlowIntensity, PeriodEntry } from '../lib/types';
import { Field, Icon, Notice, Segmented } from './ui';

export interface PeriodFormProps {
  /** Entry being edited, if any. */
  entry?: PeriodEntry;
  initialStart?: string;
  /** Compact = historical back-fill (no symptom link, "save & add another"). */
  variant?: 'full' | 'history';
  submitLabel?: string;
  onSaved(entry: PeriodInput, meta: { addAnother: boolean; logSymptoms: boolean }): void;
  onCancel?(): void;
  onEditExisting?(id: string): void;
}

const FLOW_OPTIONS: { value: FlowIntensity; label: string }[] = [
  { value: 'light', label: 'Ligero' },
  { value: 'medium', label: 'Medio' },
  { value: 'heavy', label: 'Abundante' },
];

const KIND_OPTIONS: { value: EntryKind; label: string }[] = [
  { value: 'period', label: 'Periodo' },
  { value: 'spotting', label: 'Manchado' },
];

export function PeriodForm({ entry, initialStart, variant = 'full', submitLabel, onSaved, onCancel, onEditExisting }: PeriodFormProps) {
  const { data, today } = useStore();
  const [start, setStart] = useState(entry?.start ?? initialStart ?? today);
  const [end, setEnd] = useState(entry?.end ?? '');
  const [kind, setKind] = useState<EntryKind>(entry?.kind ?? 'period');
  const [flow, setFlow] = useState<FlowIntensity>(entry?.flow ?? 'medium');
  const [notes, setNotes] = useState(entry?.notes ?? '');
  const [touched, setTouched] = useState(false);
  const [logSymptoms, setLogSymptoms] = useState(false);

  const check = useMemo(
    () => checkEntry({ id: entry?.id, start, end: end || undefined, kind }, data.periods, today),
    [entry?.id, start, end, kind, data.periods, today],
  );

  function submit(addAnother: boolean) {
    setTouched(true);
    if (check.errors.length) return;
    const input: PeriodInput = {
      start,
      kind,
      flow,
      ...(end ? { end } : {}),
      ...(notes.trim() ? { notes: notes.trim().slice(0, MAX_NOTES) } : {}),
    };
    onSaved(input, { addAnother, logSymptoms: logSymptoms && !addAnother });
    if (addAnother) {
      setStart('');
      setEnd('');
      setNotes('');
      setTouched(false);
    }
  }

  const showErrors = touched || start !== (entry?.start ?? initialStart ?? today) || end !== '';

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        submit(false);
      }}
      noValidate
    >
      <div className="grid-2 tight">
        <Field label="Primer día de sangrado" htmlFor="pf-start">
          <input
            id="pf-start"
            type="date"
            required
            value={start}
            max={today}
            onChange={(e) => setStart(e.target.value)}
          />
        </Field>
        <Field label="Último día (opcional)" htmlFor="pf-end" hint="Déjalo vacío si aún no termina.">
          <div className="input-with-clear">
            <input id="pf-end" type="date" value={end} min={start || undefined} max={today} onChange={(e) => setEnd(e.target.value)} />
            {end && (
              <button type="button" className="icon-btn" aria-label="Borrar último día" onClick={() => setEnd('')}>
                <Icon name="close" size={18} />
              </button>
            )}
          </div>
        </Field>
      </div>

      <Segmented label="Tipo" value={kind} options={KIND_OPTIONS} onChange={(v) => v && setKind(v)} />
      {kind === 'spotting' && (
        <p className="field-hint">El manchado aparece en tu calendario, pero no inicia un ciclo nuevo.</p>
      )}
      <Segmented label="Flujo" value={flow} options={FLOW_OPTIONS} onChange={(v) => v && setFlow(v)} />

      <Field label="Notas (opcional)" htmlFor="pf-notes">
        <textarea
          id="pf-notes"
          rows={variant === 'history' ? 2 : 3}
          maxLength={MAX_NOTES}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Algo que quieras recordar"
        />
      </Field>

      {variant === 'full' && !entry && (
        <label className="check-row">
          <input type="checkbox" checked={logSymptoms} onChange={(e) => setLogSymptoms(e.target.checked)} />
          <span>Después, agregar síntomas, ánimo, dolor o energía del primer día</span>
        </label>
      )}

      {showErrors &&
        check.errors.map((e) => (
          <Notice key={e.message} tone="error">
            {e.message}{' '}
            {e.relatedId && onEditExisting && (
              <button type="button" className="link" onClick={() => onEditExisting(e.relatedId!)}>
                Editar ese registro
              </button>
            )}
          </Notice>
        ))}
      {check.warnings.map((w) => (
        <Notice key={w.message} tone="warn">
          {w.message}{' '}
          {w.relatedId && onEditExisting && (
            <button type="button" className="link" onClick={() => onEditExisting(w.relatedId!)}>
              Editar ese registro
            </button>
          )}
        </Notice>
      ))}

      <div className="form-actions">
        {onCancel && (
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancelar
          </button>
        )}
        {variant === 'history' && !entry && (
          <button type="button" className="btn btn-secondary" onClick={() => submit(true)} disabled={!start}>
            Guardar y agregar otro
          </button>
        )}
        <button type="submit" className="btn btn-primary" disabled={!start}>
          {submitLabel ?? (entry ? 'Guardar cambios' : 'Guardar periodo')}
        </button>
      </div>
    </form>
  );
}
