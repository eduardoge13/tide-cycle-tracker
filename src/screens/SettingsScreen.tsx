import { useEffect, useRef, useState } from 'react';
import { formatDate, todayISO } from '../lib/dates';
import { importJSON, STORAGE_KEY } from '../lib/storage';
import { shareRecords } from '../lib/share';
import { useNav } from '../lib/nav';
import { useStore } from '../lib/store';
import type { AppData, ThemePreference } from '../lib/types';
import { Card, ConfirmDialog, Field, Icon, Notice, PrivacyNote, ScreenHeader, Segmented } from '../components/ui';

const THEMES: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'Automático' },
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Oscuro' },
];

function hasAnyData(d: AppData) {
  return d.periods.length > 0 || Object.keys(d.dayLogs).length > 0;
}

export function SettingsScreen() {
  const { data, prediction, today, updateSettings, replaceAll, deleteEverything, loadDemo, storageStatus, markBackedUp } = useStore();
  const { notify, go } = useNav();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingImport, setPendingImport] = useState<AppData | null>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmDemo, setConfirmDemo] = useState(false);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const s = data.settings;

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null));
  }, []);

  async function doShare() {
    const r = await shareRecords(data, prediction, today);
    if (r === 'cancelled') return;
    markBackedUp();
    notify(r === 'shared' ? 'Copia enviada.' : 'Copia descargada. Guárdala en un lugar privado.');
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportErrors([]);
    const result = importJSON(await file.text());
    if (!result.ok) {
      setImportErrors(result.errors.slice(0, 5).concat(result.errors.length > 5 ? [`…y ${result.errors.length - 5} más.`] : []));
      return;
    }
    setPendingImport(result.data);
  }

  async function requestPersist() {
    try {
      const ok = (await navigator.storage?.persist?.()) ?? false;
      setPersisted(ok);
      notify(ok ? 'El teléfono aceptó conservar estos datos.' : 'No se concedió. Instalar la app en la pantalla de inicio ayuda.');
    } catch {
      notify('Este navegador no permite esa solicitud.');
    }
  }

  return (
    <div className="screen">
      <ScreenHeader title="Ajustes y privacidad" />

      <Card>
        <h2 className="h-card">Enviar mis registros</h2>
        <p className="muted small">
          Abre el menú de compartir del iPhone. Elige <strong>Mail</strong> para mandártelo a tu correo: va un resumen
          fácil de leer y un archivo con todo, para restaurarlo si cambias de teléfono.
        </p>
        <p className="muted small">
          {s.lastBackupAt
            ? `Último envío: ${formatDate(todayISO(new Date(s.lastBackupAt)), { day: 'numeric', month: 'long', year: 'numeric' })}.`
            : 'Aún no has enviado una copia.'}
        </p>
        <div className="row-actions">
          <button className="btn btn-primary" onClick={doShare} disabled={!hasAnyData(data)}>
            <Icon name="upload" size={18} /> Enviar por correo
          </button>
          <button className="btn btn-secondary" onClick={() => fileRef.current?.click()}>
            <Icon name="download" size={18} /> Importar respaldo
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onFile} />
        </div>
        {importErrors.length > 0 && (
          <Notice tone="error">
            No se pudo importar ese archivo. No se cambió nada.
            <ul>
              {importErrors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </Notice>
        )}
      </Card>

      <Card className="privacy-card">
        <h2 className="h-card">
          <Icon name="lock" size={20} /> Privado de verdad
        </h2>
        <PrivacyNote />
        <ul className="bullets">
          <li>Sin cuenta, sin servidor, sin publicidad y sin rastreo.</li>
          <li>
            Todo se guarda en este teléfono (<code>{STORAGE_KEY}</code>) y funciona sin internet.
          </li>
          <li>
            <strong>Si borras la app de la pantalla de inicio o los datos de Safari, tus registros se pierden</strong>, a
            menos que te hayas enviado una copia. No existe otra copia en ningún lado.
          </li>
          <li>Cuando te envías una copia por correo, esa copia queda guardada en tu correo.</li>
        </ul>
        {storageStatus === 'unavailable' && (
          <Notice tone="error">Este navegador está bloqueando el almacenamiento (¿navegación privada?). Lo que registres no se guardará.</Notice>
        )}
        {persisted === false && (
          <button className="btn btn-ghost btn-sm" onClick={requestPersist}>
            Pedir al teléfono que conserve los datos
          </button>
        )}
      </Card>

      <Card>
        <h2 className="h-card">Estimaciones</h2>
        <div className="grid-2 tight">
          <NumberSetting
            id="s-cycle"
            label="Duración típica del ciclo"
            hint="Se usa hasta tener dos ciclos completos."
            min={15}
            max={90}
            value={s.defaultCycleLength}
            onCommit={(v) => updateSettings({ defaultCycleLength: v })}
          />
          <NumberSetting
            id="s-period"
            label="Duración típica del periodo"
            hint="Se usa hasta registrar fechas de fin."
            min={1}
            max={14}
            value={s.defaultPeriodLength}
            onCommit={(v) => updateSettings({ defaultPeriodLength: v })}
          />
        </div>
        <label className="check-row">
          <input type="checkbox" checked={s.showFertility} onChange={(e) => updateSettings({ showFertility: e.target.checked })} />
          <span>
            Mostrar ventana fértil aproximada
            <span className="field-hint block">
              Es solo un cálculo informativo de calendario. No es anticonceptivo, no previene el embarazo y no es consejo
              médico.
            </span>
          </span>
        </label>
      </Card>

      <Card>
        <h2 className="h-card">Apariencia</h2>
        <Segmented label="Tema" value={s.theme} options={THEMES} onChange={(v) => v && updateSettings({ theme: v })} />
        <p className="field-hint">El tamaño de letra sigue al del iPhone (Ajustes → Pantalla y brillo → Tamaño del texto).</p>
      </Card>

      <Card>
        <h2 className="h-card">Probar la app</h2>
        <p className="muted small">Llena la app con ciclos de ejemplo (ficticios) para ver cómo funciona.</p>
        <button
          className="btn btn-secondary"
          onClick={() => (hasAnyData(data) ? setConfirmDemo(true) : (loadDemo(), notify('Datos de ejemplo cargados.'), go({ name: 'today' })))}
        >
          Cargar datos de ejemplo
        </button>
      </Card>

      <Card className="danger-zone">
        <h2 className="h-card">Borrar todo</h2>
        <p className="muted small">Elimina para siempre todos los periodos, notas y estimaciones de este teléfono.</p>
        <button className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
          <Icon name="trash" size={18} /> Borrar todos mis datos
        </button>
      </Card>

      <p className="muted small center">Tide · formato de datos v1 · funciona sin internet · sin rastreo</p>

      <ConfirmDialog
        open={pendingImport !== null}
        title="¿Reemplazar tus datos con este respaldo?"
        confirmLabel="Reemplazar"
        destructive={hasAnyData(data)}
        onCancel={() => setPendingImport(null)}
        onConfirm={() => {
          if (pendingImport) replaceAll(pendingImport);
          setPendingImport(null);
          notify('Respaldo importado.');
          go({ name: 'today' });
        }}
      >
        {pendingImport && (
          <>
            El respaldo tiene {pendingImport.periods.length} registro{pendingImport.periods.length === 1 ? '' : 's'} de periodo y{' '}
            {Object.keys(pendingImport.dayLogs).length} día{Object.keys(pendingImport.dayLogs).length === 1 ? '' : 's'} con notas.
            {hasAnyData(data) && ' Todo lo que hay ahora en este teléfono se reemplazará.'}
          </>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmDemo}
        title="¿Reemplazar tus datos con los de ejemplo?"
        confirmLabel="Usar datos de ejemplo"
        destructive
        onCancel={() => setConfirmDemo(false)}
        onConfirm={() => {
          loadDemo();
          setConfirmDemo(false);
          notify('Datos de ejemplo cargados.');
          go({ name: 'today' });
        }}
      >
        Tus registros actuales se borrarán. Si quieres conservarlos, envíate una copia antes.
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmDelete}
        title="¿Borrar todos tus datos?"
        confirmLabel="Borrar todo"
        destructive
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          deleteEverything();
          setConfirmDelete(false);
          notify('Se borraron todos los datos de este teléfono.');
          go({ name: 'today' });
        }}
      >
        Esto elimina todos los periodos y notas de este teléfono y no se puede deshacer. Si no te enviaste una copia, se
        perderán para siempre.
      </ConfirmDialog>
    </div>
  );
}

/** Keeps its own text while typing; commits only a valid whole number on blur. */
function NumberSetting(props: { id: string; label: string; hint: string; min: number; max: number; value: number; onCommit(v: number): void }) {
  const { id, label, hint, min, max, value, onCommit } = props;
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const v = Number(text);
    if (Number.isInteger(v) && v >= min && v <= max) onCommit(v);
    else setText(String(value));
  };
  return (
    <Field label={label} htmlFor={id} hint={`${hint} (${min}–${max} días)`}>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
      />
    </Field>
  );
}
