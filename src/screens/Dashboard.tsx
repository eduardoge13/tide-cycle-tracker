import { useState } from 'react';
import { addDays, diffDays, formatDate, formatLong, formatRange, todayISO } from '../lib/dates';
import { PHASE_INFO, approximateFertileWindow, phaseFor } from '../lib/prediction';
import { useNav } from '../lib/nav';
import { useStore } from '../lib/store';
import { backupDue, shareRecords } from '../lib/share';
import { checkEntry } from '../lib/validation';
import { FEELINGS } from '../lib/types';
import { Card, ConfidenceBadge, Icon, PrivacyNote } from '../components/ui';
import { CycleRing } from '../components/CycleRing';

export function Dashboard() {
  const { data, prediction: p, today } = useStore();
  const { go } = useNav();

  if (!p.hasData || !p.lastStart) {
    return (
      <div className="screen">
        <div className="hero-empty">
          <p className="eyebrow">Bienvenida</p>
          <h1 className="display">Lleva tu ciclo en privado, en este teléfono.</h1>
          <p className="muted lede">
            Para empezar, registra el primer día de tu último periodo. Si agregas algunos periodos anteriores, las
            estimaciones mejoran.
          </p>
          <div className="stack-actions">
            <PeriodStartedButton />
            <button className="btn btn-secondary btn-lg" onClick={() => go({ name: 'history', adding: true })}>
              Agregar periodos anteriores
            </button>
          </div>
          <PrivacyNote />
        </div>
      </div>
    );
  }

  const latest = [...data.periods].filter((e) => e.kind === 'period').sort((a, b) => (a.start < b.start ? 1 : -1))[0];
  const daysIn = latest ? diffDays(latest.start, today) + 1 : 0;
  const ongoing = latest && !latest.end && daysIn <= 10;
  // While a period is still open, it's the menstrual phase no matter the typical length.
  const phase = ongoing ? 'menstrual' : phaseFor(p.cycleDay ?? 1, p.cycleLength, p.periodLength);
  const info = PHASE_INFO[phase];
  const fertile = data.settings.showFertility ? approximateFertileWindow(p.lastStart, p.cycleLength) : null;

  let headline: string;
  if (ongoing) headline = `Día ${daysIn} de tu periodo`;
  else if (p.isLate) headline = `${Math.abs(p.daysUntilNext ?? 0)} días después de lo estimado`;
  else if ((p.daysUntilNext ?? 0) > 1) headline = `Tu próximo periodo, en unos ${p.daysUntilNext} días`;
  else if (p.daysUntilNext === 1) headline = 'Tu periodo podría llegar mañana';
  else if (p.daysUntilNext === 0) headline = 'Tu periodo podría llegar hoy';
  else headline = 'Tu periodo podría llegar cualquier día';

  return (
    <div className="screen">
      <Card className="hero" aria-label="Ciclo actual">
        <div className="hero-grid">
          <CycleRing day={p.cycleDay ?? 1} length={p.cycleLength} periodLength={p.periodLength} late={p.isLate} />
          <div className="hero-text">
            <p className="eyebrow">{info.label}</p>
            <h1 className="display">{headline}</h1>
            <p className="muted">{info.blurb}</p>
          </div>
        </div>
      </Card>

      {ongoing && latest && daysIn >= Math.max(3, p.periodLength) ? (
        <EndPrompt periodId={latest.id} />
      ) : (
        !ongoing && <PeriodStartedButton prominent={p.isLate || (p.daysUntilNext ?? 0) <= 7} />
      )}

      <FeelingCheckIn />

      {backupDue(data) && <BackupReminder />}

      <div className="grid-2">
        <Card>
          <p className="eyebrow">Próximo periodo · estimado</p>
          <p className="big-range">Entre el {formatRange(p.rangeStart!, p.rangeEnd!)}</p>
          <p className="muted small">
            Lo más probable: alrededor del {formatDate(p.nextStart!, { weekday: 'short', day: 'numeric', month: 'short' })}. Los ciclos
            varían, así que es un rango, no una promesa.
          </p>
          <div className="row-between">
            <ConfidenceBadge level={p.confidence} />
            <span className="muted small">
              {p.method === 'default'
                ? `Con un promedio de ${p.cycleLength} días`
                : `Según ${p.cyclesUsed} ciclo${p.cyclesUsed === 1 ? '' : 's'}`}
            </span>
          </div>
        </Card>

        <Card>
          <dl className="facts">
            <div>
              <dt>Día del ciclo</dt>
              <dd>{p.cycleDay}</dd>
            </div>
            <div>
              <dt>Último periodo</dt>
              <dd>{formatLong(p.lastStart)}</dd>
            </div>
            <div>
              <dt>Ciclo típico</dt>
              <dd>{p.cycleLength} días</dd>
            </div>
          </dl>
        </Card>
      </div>

      {p.method === 'default' && (
        <p className="muted small hint-line">
          Mientras no haya dos ciclos completos, la app usa un ciclo de {p.cycleLength} días.{' '}
          <button className="link" onClick={() => go({ name: 'history', adding: true })}>
            Agrega periodos anteriores
          </button>{' '}
          para mejorarlo.
        </p>
      )}

      {fertile && (
        <Card className="fertile-card">
          <p className="eyebrow">Ventana fértil aproximada · solo informativa</p>
          <p>
            {formatRange(fertile.start, fertile.end)}; ovulación estimada alrededor del {formatDate(fertile.ovulation)}.
          </p>
          <p className="muted small">
            Es un cálculo aproximado de calendario. No es anticonceptivo, no previene el embarazo y no es consejo médico.
          </p>
        </Card>
      )}

      {data.predictionChecks.length > 0 && <LastCheck />}

      <PrivacyNote compact />
    </div>
  );
}

/** One tap: logs a period starting today with sensible defaults, with undo. */
function PeriodStartedButton({ prominent = true }: { prominent?: boolean }) {
  const { data, today, addPeriod, deletePeriod } = useStore();
  const { go, notify } = useNav();
  const check = checkEntry({ start: today, kind: 'period' }, data.periods, today);
  if (check.errors.length) return null; // already logged today

  return (
    <div className="primary-action">
      <button
        className={prominent ? 'btn btn-primary btn-xl' : 'btn btn-secondary btn-lg full'}
        onClick={() => {
          // Anything unusual (e.g. very close to the last period) goes through the form so the user sees why.
          if (check.warnings.length) {
            go({ name: 'log', tab: 'period', date: today });
            return;
          }
          const { entry, check: result } = addPeriod({ start: today, kind: 'period', flow: 'medium' });
          const off = result ? Math.abs(result.errorDays) : 0;
          const detail = result
            ? result.errorDays === 0
              ? ' Llegó justo el día estimado.'
              : ` Llegó ${off} día${off === 1 ? '' : 's'} ${result.errorDays > 0 ? 'después' : 'antes'} de lo estimado.`
            : '';
          notify(`Listo: tu periodo empezó hoy.${detail}`, { label: 'Deshacer', run: () => deletePeriod(entry.id) });
        }}
      >
        <Icon name="drop" size={24} /> Me bajó hoy
      </button>
      <button className="link small-link" onClick={() => go({ name: 'log', tab: 'period' })}>
        ¿Empezó otro día?
      </button>
    </div>
  );
}

/** Asked a few days in, so nobody has to remember to mark the end. */
function EndPrompt({ periodId }: { periodId: string }) {
  const { data, today, updatePeriod } = useStore();
  const { notify } = useNav();
  const [snoozed, setSnoozed] = useState(() => readSnooze() === today);
  const entry = data.periods.find((x) => x.id === periodId);
  if (!entry || snoozed) return null;

  const end = (date: string) => {
    updatePeriod(entry.id, { ...entry, end: date < entry.start ? entry.start : date });
    notify('Guardado. Tu periodo terminó.');
  };

  return (
    <Card className="prompt-card" aria-label="Fin del periodo">
      <p className="prompt-q">¿Ya terminó tu periodo?</p>
      <div className="prompt-actions">
        <button className="btn btn-primary" onClick={() => end(today)}>
          Sí, hoy
        </button>
        <button className="btn btn-secondary" onClick={() => end(addDays(today, -1))}>
          Ayer
        </button>
        <button
          className="btn btn-ghost"
          onClick={() => {
            writeSnooze(today);
            setSnoozed(true);
          }}
        >
          Todavía no
        </button>
      </div>
    </Card>
  );
}

// "Todavía no" hides the question until tomorrow. A UI convenience only, so it lives outside the data key.
const SNOOZE_KEY = 'cycleTracker:endPromptSnooze';
function readSnooze(): string | null {
  try {
    return localStorage.getItem(SNOOZE_KEY);
  } catch {
    return null;
  }
}
function writeSnooze(date: string) {
  try {
    localStorage.setItem(SNOOZE_KEY, date);
  } catch {
    /* ignore */
  }
}

/** One tap to say how today feels; details are optional. */
function FeelingCheckIn() {
  const { data, today, setFeeling } = useStore();
  const { go } = useNav();
  const log = data.dayLogs[today];
  const current = log?.feeling;

  return (
    <Card aria-label="Cómo te sientes hoy">
      <p className="prompt-q">¿Cómo te sientes hoy?</p>
      <div className="feelings" role="radiogroup" aria-label="Cómo te sientes hoy">
        {FEELINGS.map((f) => (
          <button
            key={f.value}
            type="button"
            role="radio"
            aria-checked={current === f.value}
            className={`feeling ${current === f.value ? 'on' : ''}`}
            onClick={() => setFeeling(today, current === f.value ? undefined : f.value)}
          >
            <span className="feeling-emoji" aria-hidden>
              {f.emoji}
            </span>
            <span className="feeling-label">{f.label}</span>
          </button>
        ))}
      </div>
      <p className="muted small feeling-foot">
        {current ? 'Guardado ✓ · ' : ''}
        <button className="link" onClick={() => go({ name: 'log', tab: 'day', date: today })}>
          {log && Object.keys(log).length > 3 ? 'Ver o editar detalles' : 'Agregar síntomas o notas'}
        </button>
      </p>
    </Card>
  );
}

function BackupReminder() {
  const { data, prediction, today, markBackedUp } = useStore();
  const { notify } = useNav();
  const last = data.settings.lastBackupAt;
  return (
    <Card className="backup-card">
      <p className="prompt-q">Envíate una copia de tus registros</p>
      <p className="muted small">
        {last
          ? `Última copia: ${formatDate(todayISO(new Date(last)), { day: 'numeric', month: 'long' })}.`
          : 'Aún no has guardado una copia.'}{' '}
        Si borras la app sin una copia, tus datos se pierden.
      </p>
      <button
        className="btn btn-secondary"
        onClick={async () => {
          const r = await shareRecords(data, prediction, today);
          if (r === 'cancelled') return;
          markBackedUp();
          notify(r === 'shared' ? 'Copia enviada.' : 'Copia descargada en Archivos.');
        }}
      >
        <Icon name="upload" size={18} /> Enviar por correo
      </button>
    </Card>
  );
}

function LastCheck() {
  const { data } = useStore();
  const c = data.predictionChecks[data.predictionChecks.length - 1]!;
  const off = Math.abs(c.errorDays);
  const when =
    c.errorDays === 0 ? 'justo el día estimado' : `${off} día${off === 1 ? '' : 's'} ${c.errorDays > 0 ? 'después' : 'antes'} de lo estimado`;
  return (
    <Card className="check-card">
      <p className="eyebrow">¿Qué tan bien le atinamos?</p>
      <p>
        Tu periodo del {formatDate(c.actualStart)} llegó {when}
        {c.withinRange ? ', dentro del rango esperado.' : ', fuera del rango esperado. Las próximas estimaciones ya lo toman en cuenta.'}
      </p>
    </Card>
  );
}
