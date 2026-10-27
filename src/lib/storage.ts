/**
 * Local persistence.
 *
 * - One versioned key in localStorage. Nothing else is stored anywhere.
 * - `migrate` upgrades older shapes step by step; add a function to
 *   MIGRATIONS (and bump CURRENT_VERSION) whenever the schema changes.
 * - `parseAppData` validates untrusted input (imports, or storage edited by
 *   hand) before it ever reaches the app.
 * - Never log data: errors carry only generic messages.
 */

import { isValidISODate } from './dates';
import {
  DEFAULT_SETTINGS,
  emptyData,
  type AppData,
  type Bleeding,
  type DayLog,
  type Mood,
  type PeriodEntry,
  type PredictionCheck,
  type Settings,
} from './types';
import { MAX_NOTES } from './validation';

export const STORAGE_KEY = 'cycleTracker:v1';
export const CURRENT_VERSION = 1;
export const EXPORT_APP_ID = 'tide-cycle-tracker';

/** Minimal storage interface so tests can pass an in-memory fake. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

type Json = Record<string, unknown>;
type Migration = (data: Json) => Json;

/**
 * MIGRATIONS[n] upgrades a version-n object to version n+1.
 * Version 0 = an unversioned object (e.g. an early prototype export that
 * used `cycles` for the period list and had no settings).
 */
const MIGRATIONS: Record<number, Migration> = {
  0: (d) => ({
    ...d,
    version: 1,
    periods: Array.isArray(d.periods) ? d.periods : Array.isArray(d.cycles) ? d.cycles : [],
    dayLogs: isObject(d.dayLogs) ? d.dayLogs : {},
    settings: isObject(d.settings) ? d.settings : {},
    predictionChecks: Array.isArray(d.predictionChecks) ? d.predictionChecks : [],
  }),
};

function isObject(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function migrate(raw: Json): Json {
  let data = raw;
  let version = typeof data.version === 'number' ? data.version : 0;
  if (version > CURRENT_VERSION) {
    throw new Error('Estos datos se crearon con una versión más nueva de la app.');
  }
  while (version < CURRENT_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) throw new Error(`No hay migración desde la versión ${version}.`);
    data = step(data);
    version = typeof data.version === 'number' ? data.version : version + 1;
  }
  return data;
}

// ---------- validation ----------

export type ParseResult = { ok: true; data: AppData } | { ok: false; errors: string[] };

const FLOWS = new Set(['light', 'medium', 'heavy']);
const KINDS = new Set(['period', 'spotting']);
const BLEEDING = new Set<Bleeding>(['none', 'spotting', 'light', 'medium', 'heavy']);
const MOOD_SET = new Set<Mood>(['calm', 'happy', 'sensitive', 'irritable', 'anxious', 'low']);
const THEMES = new Set(['system', 'light', 'dark']);

function optString(v: unknown, max = MAX_NOTES): string | undefined | false {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v !== 'string' || v.length > max) return false;
  return v;
}

function isInt(v: unknown, min: number, max: number): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
}

function parsePeriod(v: unknown, i: number, errors: string[]): PeriodEntry | null {
  const where = `Periodo #${i + 1}`;
  if (!isObject(v)) return errors.push(`${where} no es válido.`), null;
  if (typeof v.id !== 'string' || v.id.length === 0 || v.id.length > 100) return errors.push(`${where} no tiene un id válido.`), null;
  if (!isValidISODate(v.start)) return errors.push(`${where} tiene una fecha de inicio inválida.`), null;
  let end: string | undefined;
  if (v.end !== undefined && v.end !== null && v.end !== '') {
    if (!isValidISODate(v.end) || v.end < v.start) return errors.push(`${where} tiene una fecha de fin inválida.`), null;
    end = v.end;
  }
  const kind = v.kind ?? 'period';
  if (typeof kind !== 'string' || !KINDS.has(kind)) return errors.push(`${where} tiene un tipo desconocido.`), null;
  const flow = v.flow ?? 'medium';
  if (typeof flow !== 'string' || !FLOWS.has(flow)) return errors.push(`${where} tiene un flujo desconocido.`), null;
  const notes = optString(v.notes);
  if (notes === false) return errors.push(`${where} tiene notas inválidas.`), null;
  const now = new Date().toISOString();
  return {
    id: v.id,
    start: v.start,
    ...(end ? { end } : {}),
    kind: kind as PeriodEntry['kind'],
    flow: flow as PeriodEntry['flow'],
    ...(notes ? { notes } : {}),
    createdAt: typeof v.createdAt === 'string' ? v.createdAt : now,
    updatedAt: typeof v.updatedAt === 'string' ? v.updatedAt : now,
  };
}

function parseDayLog(key: string, v: unknown, errors: string[]): DayLog | null {
  const where = `Registro diario ${isValidISODate(key) ? key : '(fecha desconocida)'}`;
  if (!isValidISODate(key) || !isObject(v)) return errors.push(`${where} no es válido.`), null;
  const log: DayLog = { date: key, updatedAt: typeof v.updatedAt === 'string' ? v.updatedAt : new Date().toISOString() };
  if (v.bleeding !== undefined) {
    if (!BLEEDING.has(v.bleeding as Bleeding)) return errors.push(`${where} tiene un valor de sangrado desconocido.`), null;
    log.bleeding = v.bleeding as Bleeding;
  }
  for (const flag of ['cramps', 'bloating', 'headache', 'breastTenderness'] as const) {
    if (v[flag] !== undefined) {
      if (typeof v[flag] !== 'boolean') return errors.push(`${where} tiene un valor inválido (${flag}).`), null;
      log[flag] = v[flag] as boolean;
    }
  }
  if (v.pain !== undefined) {
    if (!isInt(v.pain, 0, 3)) return errors.push(`${where} tiene un nivel de dolor inválido.`), null;
    log.pain = v.pain as DayLog['pain'];
  }
  if (v.lhTest !== undefined) {
    if (v.lhTest !== 'positive' && v.lhTest !== 'negative') return errors.push(`${where} tiene una prueba de ovulación inválida.`), null;
    log.lhTest = v.lhTest;
  }
  for (const scale of ['feeling', 'energy', 'sleep'] as const) {
    if (v[scale] !== undefined) {
      if (!isInt(v[scale], 1, 5)) return errors.push(`${where} tiene un valor inválido (${scale}).`), null;
      log[scale] = v[scale] as DayLog['energy'];
    }
  }
  if (v.moods !== undefined) {
    if (!Array.isArray(v.moods) || !v.moods.every((m) => MOOD_SET.has(m as Mood))) {
      return errors.push(`${where} tiene un estado de ánimo desconocido.`), null;
    }
    log.moods = [...new Set(v.moods as Mood[])];
  }
  const notes = optString(v.notes);
  if (notes === false) return errors.push(`${where} tiene notas inválidas.`), null;
  if (notes) log.notes = notes;
  return log;
}

function parseSettings(v: unknown): Settings {
  const s = isObject(v) ? v : {};
  return {
    defaultCycleLength: isInt(s.defaultCycleLength, 15, 90) ? s.defaultCycleLength : DEFAULT_SETTINGS.defaultCycleLength,
    defaultPeriodLength: isInt(s.defaultPeriodLength, 1, 14) ? s.defaultPeriodLength : DEFAULT_SETTINGS.defaultPeriodLength,
    showOvulation: typeof s.showOvulation === 'boolean' ? s.showOvulation : DEFAULT_SETTINGS.showOvulation,
    theme: typeof s.theme === 'string' && THEMES.has(s.theme) ? (s.theme as Settings['theme']) : DEFAULT_SETTINGS.theme,
    ...(typeof s.lastBackupAt === 'string' && !Number.isNaN(Date.parse(s.lastBackupAt)) ? { lastBackupAt: s.lastBackupAt } : {}),
  };
}

function parseCheck(v: unknown): PredictionCheck | null {
  if (!isObject(v)) return null;
  const dates = ['previousStart', 'predictedStart', 'rangeStart', 'rangeEnd', 'actualStart'] as const;
  if (!dates.every((k) => isValidISODate(v[k]))) return null;
  if (!isInt(v.errorDays, -120, 120) || typeof v.withinRange !== 'boolean') return null;
  return v as unknown as PredictionCheck;
}

/** Validate any unknown value (parsed JSON) into AppData. */
export function parseAppData(input: unknown): ParseResult {
  // Accept either a raw AppData object or our export envelope { app, data }.
  let raw: unknown = input;
  if (isObject(input) && input.app === EXPORT_APP_ID && 'data' in input) raw = input.data;
  if (!isObject(raw)) return { ok: false, errors: ['El archivo no contiene datos de ciclo.'] };

  let migrated: Json;
  try {
    migrated = migrate(raw);
  } catch (e) {
    return { ok: false, errors: [e instanceof Error ? e.message : 'Versión de datos no compatible.'] };
  }

  const errors: string[] = [];
  if (!Array.isArray(migrated.periods)) errors.push('Falta la lista de periodos.');
  if (migrated.dayLogs !== undefined && !isObject(migrated.dayLogs)) errors.push('Los registros diarios están dañados.');
  if (errors.length) return { ok: false, errors };

  const periods: PeriodEntry[] = [];
  const ids = new Set<string>();
  (migrated.periods as unknown[]).forEach((p, i) => {
    const parsed = parsePeriod(p, i, errors);
    if (!parsed) return;
    if (ids.has(parsed.id)) {
      errors.push(`Period #${i + 1} repite un id.`);
      return;
    }
    ids.add(parsed.id);
    periods.push(parsed);
  });

  const dayLogs: Record<string, DayLog> = {};
  for (const [key, value] of Object.entries((migrated.dayLogs as Json | undefined) ?? {})) {
    const parsed = parseDayLog(key, value, errors);
    if (parsed) dayLogs[key] = parsed;
  }

  if (errors.length) return { ok: false, errors };

  const predictionChecks = Array.isArray(migrated.predictionChecks)
    ? (migrated.predictionChecks as unknown[]).map(parseCheck).filter((c): c is PredictionCheck => c !== null)
    : [];

  return {
    ok: true,
    data: {
      version: 1,
      periods: periods.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0)),
      dayLogs,
      settings: parseSettings(migrated.settings),
      predictionChecks,
    },
  };
}

// ---------- load / save ----------

export type LoadResult =
  | { status: 'ok'; data: AppData }
  | { status: 'empty'; data: AppData }
  | { status: 'unavailable'; data: AppData }
  | { status: 'corrupt'; data: AppData; raw: string };

export function getDefaultStore(): KeyValueStore | null {
  try {
    const s = window.localStorage;
    const probe = '__cycleTracker_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

export function loadData(store: KeyValueStore | null): LoadResult {
  if (!store) return { status: 'unavailable', data: emptyData() };
  let raw: string | null;
  try {
    raw = store.getItem(STORAGE_KEY);
  } catch {
    return { status: 'unavailable', data: emptyData() };
  }
  if (raw === null) return { status: 'empty', data: emptyData() };
  try {
    const result = parseAppData(JSON.parse(raw));
    if (result.ok) return { status: 'ok', data: result.data };
  } catch {
    /* fall through — never echo the raw content */
  }
  return { status: 'corrupt', data: emptyData(), raw };
}

export function saveData(store: KeyValueStore | null, data: AppData): boolean {
  if (!store) return false;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function clearData(store: KeyValueStore | null): void {
  try {
    store?.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function exportJSON(data: AppData, now = new Date()): string {
  return JSON.stringify({ app: EXPORT_APP_ID, exportedAt: now.toISOString(), data }, null, 2);
}

export function importJSON(text: string): ParseResult {
  if (text.length > 5_000_000) return { ok: false, errors: ['El archivo es demasiado grande para ser un respaldo.'] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['El archivo no es un JSON válido.'] };
  }
  return parseAppData(parsed);
}
