/**
 * Cycle prediction.
 *
 * Pure functions only — no storage, no React, no clock. `today` is always
 * passed in so the module is deterministic and easy to test.
 *
 * Rules (see README for the reasoning):
 *  - A cycle starts on the first day of a *full period* (spotting never starts a cycle).
 *  - Cycle length = days between two consecutive cycle starts.
 *  - Implausible gaps (shorter than `minCycleLength`, longer than `maxCycleLength`)
 *    are kept for display but excluded from the estimate.
 *  - < 2 completed cycles → configurable default (28 days), Low confidence.
 *  - 2–5 completed cycles  → median of the (outlier-damped) cycle lengths.
 *  - ≥ 6 completed cycles  → recency-weighted mean of the last six, outlier-damped.
 *  - The result is always a range, never a single guaranteed date.
 */

import { addDays, diffDays, isValidISODate, type ISODate } from './dates';
import type { PeriodEntry, PredictionCheck } from './types';

export type Confidence = 'low' | 'medium' | 'high';
export type PredictionMethod = 'default' | 'median' | 'weighted';
export type Phase = 'menstrual' | 'follicular' | 'ovulatory' | 'luteal' | 'late';

export interface CycleSample {
  start: ISODate;
  nextStart: ISODate;
  length: number;
  /** Used for the estimate (false = implausible gap, likely a missed log). */
  included: boolean;
  excludedReason?: 'too-short' | 'too-long';
  /** Far from the typical length; its influence on the estimate is reduced. */
  outlier: boolean;
}

export interface PredictedPeriod {
  start: ISODate;
  end: ISODate;
  rangeStart: ISODate;
  rangeEnd: ISODate;
}

export interface Prediction {
  hasData: boolean;
  lastStart: ISODate | null;
  /** Estimated cycle length, rounded to whole days. */
  cycleLength: number;
  /** Unrounded estimate, useful for display/debugging. */
  rawCycleLength: number;
  periodLength: number;
  method: PredictionMethod;
  confidence: Confidence;
  /** Completed, plausible cycles used for the estimate. */
  cyclesUsed: number;
  /** Standard deviation (days) of the cycles used, after damping. */
  variability: number;
  /** ± days around the estimated start. Always ≥ 1. */
  halfWidth: number;
  nextStart: ISODate | null;
  rangeStart: ISODate | null;
  rangeEnd: ISODate | null;
  cycleDay: number | null;
  /** Negative when the estimated start has passed. */
  daysUntilNext: number | null;
  /** Today is past the end of the estimated range. */
  isLate: boolean;
  samples: CycleSample[];
  upcoming: PredictedPeriod[];
}

export interface PredictionOptions {
  today: ISODate;
  defaultCycleLength?: number;
  defaultPeriodLength?: number;
  minCycleLength?: number;
  maxCycleLength?: number;
  /** Past prediction checks; consistent misses widen the range. */
  checks?: PredictionCheck[];
  upcomingCount?: number;
}

export const RECENT_WINDOW = 6;
export const MIN_CYCLE = 15;
export const MAX_CYCLE = 90;

// ---------- small statistics helpers ----------

export function median(values: readonly number[]): number {
  if (values.length === 0) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function mean(values: readonly number[]): number {
  if (values.length === 0) return NaN;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function standardDeviation(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((acc, v) => acc + (v - m) ** 2, 0) / (values.length - 1));
}

/**
 * Bounds outside which a cycle length counts as an outlier.
 * Median ± 3 scaled MADs, but never tighter than ± 4 days so that normal
 * variation in a very regular history isn't flagged.
 */
export function outlierBounds(values: readonly number[]): { low: number; high: number } {
  const med = median(values);
  const mad = median(values.map((v) => Math.abs(v - med)));
  const band = Math.max(3 * 1.4826 * mad, 4);
  return { low: med - band, high: med + band };
}

/** Clamp each value into the outlier bounds (winsorising). */
export function dampOutliers(values: readonly number[]): number[] {
  if (values.length < 3) return [...values];
  const { low, high } = outlierBounds(values);
  return values.map((v) => Math.min(high, Math.max(low, v)));
}

/** Weights 1…n, oldest → newest, so the most recent cycle counts most. */
export function recencyWeightedMean(values: readonly number[]): number {
  let num = 0;
  let den = 0;
  values.forEach((v, i) => {
    const w = i + 1;
    num += v * w;
    den += w;
  });
  return den === 0 ? NaN : num / den;
}

// ---------- data extraction ----------

/** Sorted, de-duplicated first days of full periods on or before `today`. */
export function confirmedStarts(periods: readonly PeriodEntry[], today: ISODate): ISODate[] {
  const set = new Set<ISODate>();
  for (const p of periods) {
    if (p.kind !== 'period') continue;
    if (!isValidISODate(p.start)) continue;
    if (p.start > today) continue;
    set.add(p.start);
  }
  return [...set].sort();
}

/**
 * Turn cycle starts into cycle-length samples. A start that falls less than
 * `minCycle` days after the previous one is treated as part of that same
 * episode (or an implausible entry) and does not start a new cycle; we still
 * report the gap as an excluded sample so nothing is hidden from the user.
 */
export function buildSamples(starts: readonly ISODate[], minCycle = MIN_CYCLE, maxCycle = MAX_CYCLE): CycleSample[] {
  const samples: CycleSample[] = [];
  let anchor: ISODate | undefined = starts[0];
  for (let i = 1; i < starts.length; i++) {
    const next = starts[i]!;
    if (anchor === undefined) break;
    const length = diffDays(anchor, next);
    if (length < minCycle) {
      samples.push({ start: anchor, nextStart: next, length, included: false, excludedReason: 'too-short', outlier: false });
      continue; // keep the earlier anchor
    }
    const tooLong = length > maxCycle;
    samples.push({
      start: anchor,
      nextStart: next,
      length,
      included: !tooLong,
      ...(tooLong ? { excludedReason: 'too-long' as const } : {}),
      outlier: false,
    });
    anchor = next;
  }
  return samples;
}

/** The start of the cycle we're currently in (respecting the too-short rule). */
function currentCycleStart(starts: readonly ISODate[], minCycle: number): ISODate | null {
  let anchor: ISODate | null = starts[0] ?? null;
  for (let i = 1; i < starts.length; i++) {
    const s = starts[i]!;
    if (anchor !== null && diffDays(anchor, s) >= minCycle) anchor = s;
  }
  return anchor;
}

export function estimatePeriodLength(periods: readonly PeriodEntry[], fallback: number): number {
  const durations = periods
    .filter((p) => p.kind === 'period' && isValidISODate(p.start) && p.end !== undefined && isValidISODate(p.end))
    .sort((a, b) => (a.start < b.start ? -1 : 1))
    .map((p) => diffDays(p.start, p.end!) + 1)
    .filter((d) => d >= 1 && d <= 14)
    .slice(-RECENT_WINDOW);
  if (durations.length === 0) return fallback;
  return Math.round(median(durations));
}

function rangeWidth(method: PredictionMethod, sd: number, n: number, checks: readonly PredictionCheck[]): number {
  if (method === 'default') return 4;
  let half = Math.ceil(sd) + (n < RECENT_WINDOW ? 1 : 0);
  half = Math.max(half, n < RECENT_WINDOW ? 2 : 1);
  const recentErrors = checks.slice(-3).map((c) => Math.abs(c.errorDays));
  if (recentErrors.length >= 2) half = Math.max(half, Math.ceil(median(recentErrors)));
  return Math.min(half, 10);
}

function confidenceFor(method: PredictionMethod, sd: number, checks: readonly PredictionCheck[], totalCycles: number): Confidence {
  if (method === 'default') return 'low';
  let level: Confidence;
  if (method === 'median') level = sd <= 3 ? 'medium' : 'low';
  else level = sd <= 1 && totalCycles >= 8 ? 'high' : sd <= 4 ? 'medium' : 'low';

  // If recent estimates kept missing, be more modest.
  const recentErrors = checks.slice(-3).map((c) => Math.abs(c.errorDays));
  if (recentErrors.length >= 2 && median(recentErrors) > 4) {
    level = level === 'high' ? 'medium' : 'low';
  }
  return level;
}

// ---------- main entry point ----------

export function predict(periods: readonly PeriodEntry[], options: PredictionOptions): Prediction {
  const {
    today,
    defaultCycleLength = 28,
    defaultPeriodLength = 5,
    minCycleLength = MIN_CYCLE,
    maxCycleLength = MAX_CYCLE,
    checks = [],
    upcomingCount = 3,
  } = options;

  const starts = confirmedStarts(periods, today);
  const samples = buildSamples(starts, minCycleLength, maxCycleLength);
  const periodLength = estimatePeriodLength(periods, defaultPeriodLength);
  const lastStart = currentCycleStart(starts, minCycleLength);

  const included = samples.filter((s) => s.included);
  const recent = included.slice(-RECENT_WINDOW).map((s) => s.length);

  // Flag outliers among all plausible cycles (relative to recent behaviour).
  if (recent.length >= 3) {
    const { low, high } = outlierBounds(recent);
    for (const s of included) s.outlier = s.length < low || s.length > high;
  }

  let method: PredictionMethod;
  let raw: number;
  let sd = 0;
  if (recent.length < 2) {
    method = 'default';
    raw = defaultCycleLength;
  } else {
    const damped = dampOutliers(recent);
    sd = standardDeviation(damped);
    if (recent.length < RECENT_WINDOW) {
      method = 'median';
      raw = median(damped);
    } else {
      method = 'weighted';
      raw = recencyWeightedMean(damped);
    }
  }

  const cycleLength = Math.round(raw);
  const halfWidth = rangeWidth(method, sd, recent.length, checks);
  const confidence = confidenceFor(method, sd, checks, included.length);

  const base: Prediction = {
    hasData: lastStart !== null,
    lastStart,
    cycleLength,
    rawCycleLength: raw,
    periodLength,
    method,
    confidence,
    cyclesUsed: recent.length,
    variability: Math.round(sd * 10) / 10,
    halfWidth,
    nextStart: null,
    rangeStart: null,
    rangeEnd: null,
    cycleDay: null,
    daysUntilNext: null,
    isLate: false,
    samples,
    upcoming: [],
  };
  if (lastStart === null) return base;

  const nextStart = addDays(lastStart, cycleLength);
  const rangeStart = addDays(nextStart, -halfWidth);
  const rangeEnd = addDays(nextStart, halfWidth);

  const upcoming: PredictedPeriod[] = [];
  for (let k = 1; k <= upcomingCount; k++) {
    const start = addDays(lastStart, cycleLength * k);
    // Uncertainty grows the further ahead we look.
    const hw = halfWidth + (k - 1);
    upcoming.push({
      start,
      end: addDays(start, periodLength - 1),
      rangeStart: addDays(start, -hw),
      rangeEnd: addDays(start, hw),
    });
  }

  return {
    ...base,
    nextStart,
    rangeStart,
    rangeEnd,
    cycleDay: diffDays(lastStart, today) + 1,
    daysUntilNext: diffDays(today, nextStart),
    isLate: today > rangeEnd,
    upcoming,
  };
}

// ---------- phases & approximate fertility ----------

export function phaseFor(cycleDay: number, cycleLength: number, periodLength: number): Phase {
  if (cycleDay <= periodLength) return 'menstrual';
  if (cycleDay > cycleLength) return 'late';
  const ovulation = Math.max(periodLength + 1, cycleLength - 14);
  if (cycleDay < ovulation - 1) return 'follicular';
  if (cycleDay <= ovulation + 1) return 'ovulatory';
  return 'luteal';
}

export const PHASE_INFO: Record<Phase, { label: string; blurb: string }> = {
  menstrual: { label: 'Periodo', blurb: 'Tu ciclo empezó. Descansar y algo de calor pueden ayudar.' },
  follicular: { label: 'Fase folicular', blurb: 'Muchas veces la energía sube en estos días.' },
  ovulatory: { label: 'Cerca de la ovulación (estimado)', blurb: 'Una ventana aproximada según tu ciclo promedio.' },
  luteal: { label: 'Fase lútea', blurb: 'Hacia el final de esta fase algunas personas notan síntomas premenstruales.' },
  late: { label: 'Después de lo estimado', blurb: 'Los ciclos varían. Cuando te baje, regístralo y la estimación se ajusta.' },
};

/**
 * Educational, approximate fertile window: the ~5 days before estimated
 * ovulation plus the day after. NOT contraception or medical advice.
 */
export function approximateFertileWindow(
  cycleStart: ISODate,
  cycleLength: number,
): { start: ISODate; end: ISODate; ovulation: ISODate } {
  const ovulation = addDays(cycleStart, Math.max(cycleLength - 14, 7) - 1);
  return { start: addDays(ovulation, -5), end: addDays(ovulation, 1), ovulation };
}

// ---------- prediction vs reality ----------

/**
 * Compare the estimate made *before* a new period was logged with the actual
 * start. Returns null when the new entry isn't the next cycle (e.g. a
 * historical back-fill or a same-episode duplicate).
 */
export function evaluatePrediction(before: Prediction, actualStart: ISODate, minCycle = MIN_CYCLE): PredictionCheck | null {
  if (!before.lastStart || !before.nextStart || !before.rangeStart || !before.rangeEnd) return null;
  const gap = diffDays(before.lastStart, actualStart);
  if (gap < minCycle || gap > MAX_CYCLE) return null;
  return {
    previousStart: before.lastStart,
    predictedStart: before.nextStart,
    rangeStart: before.rangeStart,
    rangeEnd: before.rangeEnd,
    actualStart,
    errorDays: diffDays(before.nextStart, actualStart),
    withinRange: actualStart >= before.rangeStart && actualStart <= before.rangeEnd,
  };
}
