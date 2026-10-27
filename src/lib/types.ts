import type { ISODate } from './dates';

export type FlowIntensity = 'light' | 'medium' | 'heavy';
export type EntryKind = 'period' | 'spotting';
export type Bleeding = 'none' | 'spotting' | FlowIntensity;
export type Mood = 'calm' | 'happy' | 'sensitive' | 'irritable' | 'anxious' | 'low';
/** 0 none · 1 mild · 2 moderate · 3 severe */
export type PainLevel = 0 | 1 | 2 | 3;
/** 1 (very low) … 5 (very high) */
export type Scale5 = 1 | 2 | 3 | 4 | 5;
export type ThemePreference = 'system' | 'light' | 'dark';
export type LhTest = 'positive' | 'negative';

/** One bleeding episode. A cycle starts on the `start` of a full period. */
export interface PeriodEntry {
  id: string;
  start: ISODate;
  end?: ISODate;
  kind: EntryKind;
  flow: FlowIntensity;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

/** Optional per-day notes. Every field except `date` is optional. */
export interface DayLog {
  date: ISODate;
  /** One-tap check-in: 1 (mal) … 5 (muy bien). */
  feeling?: Scale5;
  bleeding?: Bleeding;
  cramps?: boolean;
  pain?: PainLevel;
  moods?: Mood[];
  energy?: Scale5;
  bloating?: boolean;
  headache?: boolean;
  breastTenderness?: boolean;
  sleep?: Scale5;
  /** Ovulation (LH) test result; positives teach the app her luteal phase. */
  lhTest?: LhTest;
  notes?: string;
  updatedAt: string;
}

export interface Settings {
  defaultCycleLength: number;
  defaultPeriodLength: number;
  /** Show estimated ovulation and fertile days (educational, not contraception). */
  showOvulation: boolean;
  theme: ThemePreference;
  /** ISO timestamp of the last time records were sent/exported. */
  lastBackupAt?: string;
}

/** Saved when a new period is logged, so we can show how the estimate did. */
export interface PredictionCheck {
  previousStart: ISODate;
  predictedStart: ISODate;
  rangeStart: ISODate;
  rangeEnd: ISODate;
  actualStart: ISODate;
  /** actual − predicted, in days. Positive = arrived later than estimated. */
  errorDays: number;
  withinRange: boolean;
}

export interface AppData {
  version: 1;
  periods: PeriodEntry[];
  dayLogs: Record<ISODate, DayLog>;
  settings: Settings;
  predictionChecks: PredictionCheck[];
}

export const DEFAULT_SETTINGS: Settings = {
  defaultCycleLength: 28,
  defaultPeriodLength: 5,
  showOvulation: true,
  theme: 'system',
};

export function emptyData(): AppData {
  return {
    version: 1,
    periods: [],
    dayLogs: {},
    settings: { ...DEFAULT_SETTINGS },
    predictionChecks: [],
  };
}

export const MOODS: { value: Mood; label: string }[] = [
  { value: 'calm', label: 'Tranquila' },
  { value: 'happy', label: 'Feliz' },
  { value: 'sensitive', label: 'Sensible' },
  { value: 'irritable', label: 'Irritable' },
  { value: 'anxious', label: 'Ansiosa' },
  { value: 'low', label: 'Decaída' },
];

export const FLOW_LABEL: Record<FlowIntensity, string> = {
  light: 'Ligero',
  medium: 'Medio',
  heavy: 'Abundante',
};

export const PAIN_LABEL: Record<PainLevel, string> = {
  0: 'Nada',
  1: 'Leve',
  2: 'Moderado',
  3: 'Fuerte',
};

export const FEELINGS: { value: Scale5; emoji: string; label: string }[] = [
  { value: 1, emoji: '😣', label: 'Mal' },
  { value: 2, emoji: '😕', label: 'Regular' },
  { value: 3, emoji: '😐', label: 'Normal' },
  { value: 4, emoji: '🙂', label: 'Bien' },
  { value: 5, emoji: '😄', label: 'Muy bien' },
];

export const BLEEDING_LABEL: Record<Bleeding, string> = {
  none: 'Nada',
  spotting: 'Manchado',
  light: 'Ligero',
  medium: 'Medio',
  heavy: 'Abundante',
};
