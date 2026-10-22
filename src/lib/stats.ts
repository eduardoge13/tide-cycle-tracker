import { diffDays, isValidISODate } from './dates';
import { mean, median, type CycleSample } from './prediction';
import type { PeriodEntry } from './types';

export interface CycleStats {
  cyclesTracked: number;
  averageCycle: number | null;
  medianCycle: number | null;
  shortest: CycleSample | null;
  longest: CycleSample | null;
  averagePeriod: number | null;
  periodsWithEnd: number;
  /** Mean of the last 3 cycles minus the mean of the 3 before them. */
  trendDelta: number | null;
  trend: 'shorter' | 'longer' | 'stable' | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function computeStats(samples: readonly CycleSample[], periods: readonly PeriodEntry[]): CycleStats {
  const included = samples.filter((s) => s.included);
  const lengths = included.map((s) => s.length);

  const durations = periods
    .filter((p) => p.kind === 'period' && p.end && isValidISODate(p.start) && isValidISODate(p.end))
    .map((p) => diffDays(p.start, p.end!) + 1)
    .filter((d) => d >= 1 && d <= 14);

  let shortest: CycleSample | null = null;
  let longest: CycleSample | null = null;
  for (const s of included) {
    if (!shortest || s.length < shortest.length) shortest = s;
    if (!longest || s.length > longest.length) longest = s;
  }

  let trendDelta: number | null = null;
  if (lengths.length >= 6) {
    const last = lengths.slice(-3);
    const prev = lengths.slice(-6, -3);
    trendDelta = round1(mean(last) - mean(prev));
  }

  return {
    cyclesTracked: included.length,
    averageCycle: lengths.length ? round1(mean(lengths)) : null,
    medianCycle: lengths.length ? round1(median(lengths)) : null,
    shortest,
    longest,
    averagePeriod: durations.length ? round1(mean(durations)) : null,
    periodsWithEnd: durations.length,
    trendDelta,
    trend: trendDelta === null ? null : trendDelta <= -2 ? 'shorter' : trendDelta >= 2 ? 'longer' : 'stable',
  };
}
