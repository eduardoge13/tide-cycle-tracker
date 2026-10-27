import { useEffect, useState } from 'react';
import { formatLong, type ISODate } from '../lib/dates';
import { useStore } from '../lib/store';
import { MAX_NOTES } from '../lib/validation';
import { MOODS, type Bleeding, type DayLog, type LhTest, type Mood, type PainLevel, type Scale5 } from '../lib/types';
import { Chip, Field, Segmented } from './ui';

const BLEEDING: { value: Bleeding; label: string }[] = [
  { value: 'none', label: 'Nada' },
  { value: 'spotting', label: 'Manchado' },
  { value: 'light', label: 'Ligero' },
  { value: 'medium', label: 'Medio' },
  { value: 'heavy', label: 'Abundante' },
];
const PAIN: { value: PainLevel; label: string }[] = [
  { value: 0, label: 'Nada' },
  { value: 1, label: 'Leve' },
  { value: 2, label: 'Moderado' },
  { value: 3, label: 'Fuerte' },
];
const LH: { value: LhTest; label: string }[] = [
  { value: 'positive', label: 'Positiva' },
  { value: 'negative', label: 'Negativa' },
];
const ENERGY: { value: Scale5; label: string }[] = [
  { value: 1, label: 'Agotada' },
  { value: 2, label: 'Baja' },
  { value: 3, label: 'Normal' },
  { value: 4, label: 'Buena' },
  { value: 5, label: 'Excelente' },
];
const SLEEP: { value: Scale5; label: string }[] = [
  { value: 1, label: 'Mal' },
  { value: 2, label: 'Inquieto' },
  { value: 3, label: 'Normal' },
  { value: 4, label: 'Bien' },
  { value: 5, label: 'Excelente' },
];

type Draft = Omit<DayLog, 'updatedAt'>;

export function isEmptyLog(d: Draft): boolean {
  return (
    d.feeling === undefined &&
    d.bleeding === undefined &&
    d.cramps === undefined &&
    d.pain === undefined &&
    !d.moods?.length &&
    d.energy === undefined &&
    d.bloating === undefined &&
    d.headache === undefined &&
    d.breastTenderness === undefined &&
    d.sleep === undefined &&
    d.lhTest === undefined &&
    !d.notes?.trim()
  );
}

export function DayLogForm({ date, onDone }: { date: ISODate; onDone(saved: boolean): void }) {
  const { data, saveDayLog, deleteDayLog } = useStore();
  const existing = data.dayLogs[date];
  const [draft, setDraft] = useState<Draft>(() => existing ?? { date });

  useEffect(() => setDraft(data.dayLogs[date] ?? { date }), [date]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => {
      const next = { ...d };
      if (value === undefined) delete next[key];
      else next[key] = value;
      return next;
    });
  const toggleFlag = (key: 'cramps' | 'bloating' | 'headache' | 'breastTenderness') =>
    set(key, draft[key] ? undefined : true);
  const toggleMood = (m: Mood) => {
    const cur = draft.moods ?? [];
    const next = cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m];
    set('moods', next.length ? next : undefined);
  };

  function save() {
    const clean: Draft = { ...draft, ...(draft.notes ? { notes: draft.notes.trim().slice(0, MAX_NOTES) } : {}) };
    if (!clean.notes) delete clean.notes;
    if (isEmptyLog(clean)) {
      if (existing) deleteDayLog(date);
      onDone(false);
      return;
    }
    saveDayLog({ ...clean, date, updatedAt: '' });
    onDone(true);
  }

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <p className="muted">
        {formatLong(date)} · Todo es opcional. Llena lo que te sirva y salta lo demás.
      </p>

      <Segmented label="Sangrado" value={draft.bleeding} options={BLEEDING} onChange={(v) => set('bleeding', v)} allowNone />

      <div className="field">
        <span className="field-label">Cuerpo</span>
        <div className="chips">
          <Chip on={!!draft.cramps} onToggle={() => toggleFlag('cramps')}>Cólicos</Chip>
          <Chip on={!!draft.bloating} onToggle={() => toggleFlag('bloating')}>Inflamación</Chip>
          <Chip on={!!draft.headache} onToggle={() => toggleFlag('headache')}>Dolor de cabeza</Chip>
          <Chip on={!!draft.breastTenderness} onToggle={() => toggleFlag('breastTenderness')}>Senos sensibles</Chip>
        </div>
      </div>

      <Segmented label="Dolor" value={draft.pain} options={PAIN} onChange={(v) => set('pain', v)} allowNone />

      <div className="field">
        <span className="field-label">Ánimo</span>
        <div className="chips">
          {MOODS.map((m) => (
            <Chip key={m.value} on={!!draft.moods?.includes(m.value)} onToggle={() => toggleMood(m.value)}>
              {m.label}
            </Chip>
          ))}
        </div>
      </div>

      <Segmented label="Energía" value={draft.energy} options={ENERGY} onChange={(v) => set('energy', v)} allowNone />
      <Segmented label="Sueño" value={draft.sleep} options={SLEEP} onChange={(v) => set('sleep', v)} allowNone />
      <Segmented label="Prueba de ovulación (LH)" value={draft.lhTest} options={LH} onChange={(v) => set('lhTest', v)} allowNone />
      <p className="field-hint">Solo si usas pruebas de ovulación. Con las positivas, la app aprende tu fase lútea y afina la estimación.</p>

      <Field label="Notas" htmlFor="dl-notes">
        <textarea
          id="dl-notes"
          rows={3}
          maxLength={MAX_NOTES}
          value={draft.notes ?? ''}
          onChange={(e) => set('notes', e.target.value || undefined)}
          placeholder="¿Cómo estuvo tu día?"
        />
      </Field>

      <div className="form-actions sticky-actions">
        {existing && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              deleteDayLog(date);
              onDone(false);
            }}
          >
            Borrar día
          </button>
        )}
        <button type="submit" className="btn btn-primary">
          Guardar
        </button>
      </div>
    </form>
  );
}
