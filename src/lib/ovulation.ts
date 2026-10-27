/**
 * Ovulation estimate (educational, never contraception).
 *
 * Ovulation happens roughly one luteal phase before the next period, and the
 * luteal phase is far steadier than the follicular phase. So instead of
 * counting forward from the last period, we count BACK from the predicted next
 * period:
 *
 *   ovulation ≈ predicted next start − luteal length − 1
 *
 * (Luteal = the days after ovulation up to the day before the next period, so a
 * 28-day cycle with a 14-day luteal phase ovulates on cycle day 14.)
 *
 * The luteal length is learned from positive ovulation (LH) tests when the
 * user logs them: ovulation ≈ the day after the first positive test of a
 * cycle, and luteal = days from then until the next period starts. Without tests we use the
 * population average of 14 days.
 *
 * Uncertainty combines the period estimate's range with the luteal spread
 * (root-sum-square), and grows for cycles further ahead.
 */

import { addDays, diffDays, isValidISODate, type ISODate } from './dates';
import { confirmedStarts, median, standardDeviation, MAX_CYCLE, MIN_CYCLE, type Confidence, type Prediction } from './prediction';
import type { DayLog, PeriodEntry } from './types';

export const DEFAULT_LUTEAL = 14;
export const LUTEAL_MIN = 10;
export const LUTEAL_MAX = 17;
/** Spread assumed for the population average (luteal is 12–16 days for most people). */
const DEFAULT_SPREAD = 2;

export interface LutealEstimate {
  length: number;
  /** Learned luteal lengths, oldest → newest (last six). */
  samples: number[];
  personalized: boolean;
  /** Standard deviation (days) used for the ovulation range. */
  spread: number;
}

export interface OvulationEstimate {
  /** First day of the cycle this ovulation belongs to. */
  cycleStart: ISODate;
  ovulation: ISODate;
  rangeStart: ISODate;
  rangeEnd: ISODate;
  /** The ~5 days before ovulation plus the day after. */
  fertileStart: ISODate;
  fertileEnd: ISODate;
}

export interface OvulationForecast {
  luteal: LutealEstimate;
  /** Ovulation of the cycle in progress (may already be in the past). */
  current: OvulationEstimate | null;
  upcoming: OvulationEstimate[];
  confidence: Confidence;
}

const FAR_FUTURE = '9999-12-31';

/** Learn the luteal phase from positive LH tests, one sample per complete cycle. */
export function estimateLutealLength(periods: readonly PeriodEntry[], dayLogs: Readonly<Record<ISODate, DayLog>>): LutealEstimate {
  const starts = confirmedStarts(periods, FAR_FUTURE);
  const positives = Object.values(dayLogs)
    .filter((l) => l.lhTest === 'positive' && isValidISODate(l.date))
    .map((l) => l.date)
    .sort();

  const samples: number[] = [];
  for (let i = 0; i + 1 < starts.length; i++) {
    const start = starts[i]!;
    const next = starts[i + 1]!;
    const gap = diffDays(start, next);
    if (gap < MIN_CYCLE || gap > MAX_CYCLE) continue;
    const firstPositive = positives.find((d) => d >= start && d < next);
    if (!firstPositive) continue;
    const luteal = diffDays(addDays(firstPositive, 1), next) - 1;
    if (luteal >= LUTEAL_MIN && luteal <= LUTEAL_MAX) samples.push(luteal);
  }

  const recent = samples.slice(-6);
  if (recent.length === 0) return { length: DEFAULT_LUTEAL, samples: [], personalized: false, spread: DEFAULT_SPREAD };
  return {
    length: Math.round(median(recent)),
    samples: recent,
    personalized: true,
    // One sample tells us little about variation; never claim less than ±1 day.
    spread: recent.length >= 2 ? Math.max(1, standardDeviation(recent)) : 1.5,
  };
}

function estimateFor(cycleStart: ISODate, cycleLength: number, periodLength: number, luteal: LutealEstimate, periodHalfWidth: number): OvulationEstimate {
  // Offset from day 1; never before the period has ended.
  const daysIn = Math.max(periodLength, cycleLength - luteal.length - 1);
  const ovulation = addDays(cycleStart, daysIn);
  const half = Math.max(1, Math.ceil(Math.sqrt(periodHalfWidth ** 2 + luteal.spread ** 2)));
  return {
    cycleStart,
    ovulation,
    rangeStart: addDays(ovulation, -half),
    rangeEnd: addDays(ovulation, half),
    fertileStart: addDays(ovulation, -5),
    fertileEnd: addDays(ovulation, 1),
  };
}

export function predictOvulation(prediction: Prediction, luteal: LutealEstimate): OvulationForecast {
  let confidence: Confidence = prediction.confidence;
  // A population-average luteal phase can't be "high" confidence for one person.
  if (!luteal.personalized && confidence === 'high') confidence = 'medium';

  if (!prediction.lastStart) return { luteal, current: null, upcoming: [], confidence: 'low' };

  const L = prediction.cycleLength;
  const current = estimateFor(prediction.lastStart, L, prediction.periodLength, luteal, prediction.halfWidth);
  const upcoming = prediction.upcoming.map((u, k) =>
    // Same widening as the period forecast: one more day per cycle ahead.
    estimateFor(u.start, L, prediction.periodLength, luteal, prediction.halfWidth + k + 1),
  );
  return { luteal, current, upcoming, confidence };
}

/** The estimate worth showing today: this cycle's if not well past, else the next one. */
export function nextOvulation(forecast: OvulationForecast, today: ISODate): OvulationEstimate | null {
  const all = [forecast.current, ...forecast.upcoming].filter((e): e is OvulationEstimate => e !== null);
  return all.find((e) => e.fertileEnd >= today) ?? null;
}
