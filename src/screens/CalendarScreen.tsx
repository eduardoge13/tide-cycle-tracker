import { useMemo, useState } from 'react';
import { addDays, daysInMonth, firstOfMonth, formatDate, formatLong, weekday, type ISODate } from '../lib/dates';
import { buildDayMarks, type DayMark } from '../lib/calendar';
import { useNav } from '../lib/nav';
import { useStore } from '../lib/store';
import { BLEEDING_LABEL, FEELINGS, FLOW_LABEL, MOODS, PAIN_LABEL, type DayLog } from '../lib/types';
import { Card, Icon, ScreenHeader } from '../components/ui';

const WEEKDAYS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const WEEKDAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function describe(mark: DayMark | undefined): string {
  if (!mark) return '';
  const parts: string[] = [];
  if (mark.period) parts.push('periodo');
  if (mark.spotting) parts.push('manchado');
  if (mark.predicted) parts.push('periodo estimado');
  if (mark.fertile) parts.push('ventana fértil aproximada');
  if (mark.hasLog) parts.push('tiene notas');
  return parts.join(', ');
}

export function CalendarScreen({ initialDate }: { initialDate?: ISODate }) {
  const { data, prediction, today } = useStore();
  const { go } = useNav();
  const [selected, setSelected] = useState<ISODate>(initialDate ?? today);
  const [cursor, setCursor] = useState(() => {
    const d = initialDate ?? today;
    return { y: Number(d.slice(0, 4)), m: Number(d.slice(5, 7)) - 1 };
  });

  const marks = useMemo(() => buildDayMarks(data, prediction, today), [data, prediction, today]);
  const first = firstOfMonth(cursor.y, cursor.m);
  const lead = weekday(first);
  const count = daysInMonth(cursor.y, cursor.m);
  const cells: (ISODate | null)[] = [...Array(lead).fill(null), ...Array.from({ length: count }, (_, i) => addDays(first, i))];
  while (cells.length % 7) cells.push(null);

  const shift = (delta: number) =>
    setCursor(({ y, m }) => {
      const n = m + delta;
      return { y: y + Math.floor(n / 12), m: ((n % 12) + 12) % 12 };
    });
  const jumpToday = () => {
    setCursor({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 });
    setSelected(today);
  };

  const monthLabel = formatDate(first, { month: 'long', year: 'numeric' });
  const sel = marks.get(selected);
  const log = data.dayLogs[selected];
  const entriesOnDay = data.periods.filter((p) => p.start <= selected && (p.end ?? p.start) >= selected);

  return (
    <div className="screen">
      <ScreenHeader
        title="Calendario"
        action={
          <button className="btn btn-ghost btn-sm" onClick={jumpToday}>
            Hoy
          </button>
        }
      />
      <Card className="calendar-card">
        <div className="cal-head">
          <button className="icon-btn" onClick={() => shift(-1)} aria-label="Mes anterior">
            <Icon name="left" />
          </button>
          <h2 aria-live="polite">{monthLabel}</h2>
          <button className="icon-btn" onClick={() => shift(1)} aria-label="Mes siguiente">
            <Icon name="right" />
          </button>
        </div>
        <div className="cal-grid" role="grid" aria-label={monthLabel}>
          {WEEKDAYS.map((w, i) => (
            <div key={i} className="cal-dow" role="columnheader" aria-label={WEEKDAY_NAMES[i]}>
              {w}
            </div>
          ))}
          {cells.map((d, i) =>
            d === null ? (
              <div key={`x${i}`} className="cal-cell empty" aria-hidden />
            ) : (
              <DayCell key={d} date={d} mark={marks.get(d)} today={today} selected={selected === d} onSelect={setSelected} />
            ),
          )}
        </div>
        <ul className="legend" aria-label="Simbología">
          <li><span className="sw sw-period" /> Periodo</li>
          <li><span className="sw sw-spot" /> Manchado</li>
          <li><span className="sw sw-pred" /> Estimado</li>
          {data.settings.showFertility && <li><span className="sw sw-fertile" /> Fértil (aprox.)</li>}
          <li><span className="sw sw-today" /> Hoy</li>
        </ul>
      </Card>

      <Card aria-label="Día seleccionado">
        <p className="eyebrow">{selected === today ? 'Hoy' : 'Día seleccionado'}</p>
        <h2 className="h-day">{formatLong(selected)}</h2>
        <SelectedSummary mark={sel} log={log} />
        {entriesOnDay.map((e) => (
          <p key={e.id} className="muted small">
            {e.kind === 'period' ? 'Periodo' : 'Manchado'} · flujo {FLOW_LABEL[e.flow].toLowerCase()} · empezó el {formatDate(e.start)}
            {e.end ? `, terminó el ${formatDate(e.end)}` : ', sin fecha de fin'}{' '}
            <button className="link" onClick={() => go({ name: 'log', tab: 'period', editId: e.id })}>
              Editar
            </button>
          </p>
        ))}
        {selected <= today ? (
          <div className="row-actions">
            <button className="btn btn-secondary" onClick={() => go({ name: 'log', tab: 'day', date: selected })}>
              <Icon name="note" size={18} /> {log ? 'Editar notas' : 'Agregar notas'}
            </button>
            {entriesOnDay.length === 0 && (
              <button className="btn btn-secondary" onClick={() => go({ name: 'log', tab: 'period', date: selected })}>
                <Icon name="drop" size={18} /> Empezó mi periodo
              </button>
            )}
          </div>
        ) : (
          <p className="muted small">Los días futuros todavía no se pueden registrar.</p>
        )}
      </Card>
    </div>
  );
}

function DayCell({ date, mark, today, selected, onSelect }: { date: ISODate; mark?: DayMark; today: ISODate; selected: boolean; onSelect(d: ISODate): void }) {
  const cls = ['cal-cell'];
  if (mark?.period) cls.push('is-period');
  else if (mark?.predicted) cls.push('is-pred');
  if (mark?.spotting && !mark.period) cls.push('is-spot');
  if (mark?.fertile) cls.push('is-fertile');
  if (date === today) cls.push('is-today');
  if (selected) cls.push('is-selected');
  if (date > today) cls.push('is-future');
  const desc = describe(mark);
  return (
    <button
      type="button"
      role="gridcell"
      className={cls.join(' ')}
      aria-selected={selected}
      aria-current={date === today ? 'date' : undefined}
      aria-label={`${formatDate(date, { weekday: 'long', month: 'long', day: 'numeric' })}${desc ? `: ${desc}` : ''}`}
      onClick={() => onSelect(date)}
    >
      <span className="num">{Number(date.slice(8))}</span>
      {(mark?.hasLog || mark?.spotting) && <span className={`pip ${mark.spotting && !mark.period ? 'pip-spot' : ''}`} aria-hidden />}
    </button>
  );
}

function SelectedSummary({ mark, log }: { mark?: DayMark; log?: DayLog }) {
  const tags: string[] = [];
  if (mark?.period) tags.push('Periodo (registrado)');
  if (mark?.spotting) tags.push('Manchado (registrado)');
  if (mark?.predicted) tags.push('Periodo estimado');
  if (mark?.fertile) tags.push('Ventana fértil aproximada (solo informativa)');
  if (log) {
    const feeling = FEELINGS.find((f) => f.value === log.feeling);
    if (feeling) tags.push(`${feeling.emoji} ${feeling.label}`);
    if (log.bleeding && log.bleeding !== 'none') tags.push(`Sangrado: ${BLEEDING_LABEL[log.bleeding].toLowerCase()}`);
    if (log.cramps) tags.push('Cólicos');
    if (log.pain !== undefined) tags.push(`Dolor: ${PAIN_LABEL[log.pain].toLowerCase()}`);
    if (log.moods?.length) tags.push(`Ánimo: ${log.moods.map((m) => MOODS.find((x) => x.value === m)?.label ?? m).join(', ')}`);
    if (log.energy) tags.push(`Energía ${log.energy}/5`);
    if (log.sleep) tags.push(`Sueño ${log.sleep}/5`);
    if (log.bloating) tags.push('Inflamación');
    if (log.headache) tags.push('Dolor de cabeza');
    if (log.breastTenderness) tags.push('Senos sensibles');
  }
  if (!tags.length && !log?.notes) return <p className="muted">No hay nada registrado este día.</p>;
  return (
    <>
      <ul className="tag-list">
        {tags.map((t) => (
          <li key={t} className={t.startsWith('Periodo estimado') || t.startsWith('Ventana') ? 'tag tag-pred' : 'tag'}>
            {t}
          </li>
        ))}
      </ul>
      {log?.notes && <p className="note-text">{log.notes}</p>}
    </>
  );
}
