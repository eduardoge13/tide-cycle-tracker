import { describe, expect, it } from 'vitest';
import { addDays, diffDays } from '../src/lib/dates';
import {
  approximateFertileWindow,
  buildSamples,
  confirmedStarts,
  dampOutliers,
  evaluatePrediction,
  median,
  phaseFor,
  predict,
  recencyWeightedMean,
} from '../src/lib/prediction';
import type { PeriodEntry } from '../src/lib/types';

let seq = 0;
function period(start: string, opts: Partial<PeriodEntry> = {}): PeriodEntry {
  return {
    id: `p${seq++}`,
    start,
    kind: 'period',
    flow: 'medium',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    ...opts,
  };
}

/** Build periods from a first start and a list of cycle lengths. */
function history(first: string, lengths: number[], duration = 5): PeriodEntry[] {
  const out = [period(first, { end: addDays(first, duration - 1) })];
  let s = first;
  for (const len of lengths) {
    s = addDays(s, len);
    out.push(period(s, { end: addDays(s, duration - 1) }));
  }
  return out;
}

describe('statistics helpers', () => {
  it('median handles odd and even counts', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it('recency-weighted mean favours the latest value', () => {
    expect(recencyWeightedMean([20, 30])).toBeCloseTo((20 * 1 + 30 * 2) / 3);
  });

  it('damping clamps extreme values but keeps normal ones', () => {
    const damped = dampOutliers([28, 29, 28, 30, 60]);
    expect(damped.slice(0, 4)).toEqual([28, 29, 28, 30]);
    expect(damped[4]).toBeLessThan(40);
  });
});

describe('predict — no or minimal data', () => {
  const today = '2025-06-15';

  it('returns an empty prediction when nothing is logged', () => {
    const p = predict([], { today });
    expect(p.hasData).toBe(false);
    expect(p.nextStart).toBeNull();
    expect(p.confidence).toBe('low');
    expect(p.cycleLength).toBe(28);
  });

  it('only one historical period → default length, Low confidence, still a range', () => {
    const p = predict([period('2025-06-01')], { today });
    expect(p.method).toBe('default');
    expect(p.confidence).toBe('low');
    expect(p.nextStart).toBe('2025-06-29');
    expect(p.rangeStart).not.toBe(p.rangeEnd);
    expect(p.cycleDay).toBe(15);
  });

  it('one completed cycle is still below the threshold → default', () => {
    const p = predict([period('2025-05-01'), period('2025-05-31')], { today });
    expect(p.cyclesUsed).toBe(1);
    expect(p.method).toBe('default');
    expect(p.nextStart).toBe(addDays('2025-05-31', 28));
  });

  it('uses the configurable default length', () => {
    const p = predict([period('2025-06-01')], { today, defaultCycleLength: 32 });
    expect(p.nextStart).toBe('2025-07-03');
  });
});

describe('predict — regular cycles', () => {
  it('2–5 cycles use the median', () => {
    const periods = history('2025-01-01', [27, 28, 30]);
    const last = periods[periods.length - 1]!.start;
    const p = predict(periods, { today: addDays(last, 3) });
    expect(p.method).toBe('median');
    expect(p.cycleLength).toBe(28);
    expect(p.nextStart).toBe(addDays(last, 28));
    expect(['medium', 'low']).toContain(p.confidence);
  });

  it('eight or more very regular cycles → weighted estimate, High confidence', () => {
    const periods = history('2024-01-01', [28, 28, 29, 28, 28, 28, 28, 28]);
    const last = periods[periods.length - 1]!.start;
    const p = predict(periods, { today: addDays(last, 1) });
    expect(p.method).toBe('weighted');
    expect(p.cyclesUsed).toBe(6);
    expect(p.cycleLength).toBe(28);
    expect(p.confidence).toBe('high');
    expect(p.halfWidth).toBeGreaterThanOrEqual(1);
  });

  it('very regular but only 7 cycles → not High yet', () => {
    const periods = history('2024-01-01', [28, 28, 28, 28, 28, 28, 28]);
    const last = periods[periods.length - 1]!.start;
    const p = predict(periods, { today: addDays(last, 1) });
    expect(p.method).toBe('weighted');
    expect(p.confidence).toBe('medium');
  });

  it('weights recent cycles more heavily', () => {
    // Older cycles ~26, recent ones ~32.
    const periods = history('2024-01-01', [26, 26, 26, 32, 32, 32]);
    const p = predict(periods, { today: '2024-07-01' });
    expect(p.rawCycleLength).toBeGreaterThan(29); // plain mean would be 29
  });

  it('is never a single guaranteed day', () => {
    const periods = history('2024-01-01', [28, 28, 28, 28, 28, 28, 28, 28]);
    const p = predict(periods, { today: '2024-08-20' });
    expect(diffDays(p.rangeStart!, p.rangeEnd!)).toBeGreaterThanOrEqual(2);
  });
});

describe('predict — irregular cycles', () => {
  it('produces a wider range and lower confidence', () => {
    const regular = predict(history('2024-01-01', [28, 29, 28, 28, 29, 28]), { today: '2024-07-01' });
    const irregular = predict(history('2024-01-01', [24, 35, 27, 38, 22, 33]), { today: '2024-07-01' });
    expect(irregular.halfWidth).toBeGreaterThan(regular.halfWidth);
    expect(irregular.confidence).toBe('low');
  });
});

describe('predict — outliers', () => {
  it('one extreme cycle barely moves the estimate and is flagged, not hidden', () => {
    const periods = history('2024-01-01', [28, 29, 28, 60, 28, 29, 28]);
    const p = predict(periods, { today: '2024-09-01' });
    expect(p.cycleLength).toBeGreaterThanOrEqual(28);
    expect(p.cycleLength).toBeLessThanOrEqual(31);
    const flagged = p.samples.filter((s) => s.outlier);
    expect(flagged).toHaveLength(1);
    expect(flagged[0]!.length).toBe(60);
    expect(p.samples).toHaveLength(7); // still visible
  });

  it('a gap longer than 90 days (missed logging) is excluded from the estimate', () => {
    const periods = history('2024-01-01', [28, 120, 28, 29]);
    const p = predict(periods, { today: '2024-08-01' });
    const excluded = p.samples.filter((s) => !s.included);
    expect(excluded).toHaveLength(1);
    expect(excluded[0]!.excludedReason).toBe('too-long');
    expect(p.cycleLength).toBe(28);
  });
});

describe('predict — duplicates and messy data', () => {
  it('ignores exact duplicate start dates', () => {
    const periods = [...history('2025-01-01', [28, 28]), period('2025-01-29')];
    const p = predict(periods, { today: '2025-03-01' });
    expect(confirmedStarts(periods, '2025-03-01')).toHaveLength(3);
    expect(p.cyclesUsed).toBe(2);
  });

  it('a start a few days after another does not split the cycle', () => {
    const starts = ['2025-01-01', '2025-01-04', '2025-01-29'];
    const samples = buildSamples(starts);
    expect(samples[0]!.included).toBe(false);
    expect(samples[0]!.excludedReason).toBe('too-short');
    expect(samples[1]!.length).toBe(28); // measured from Jan 1, not Jan 4
    expect(samples[1]!.included).toBe(true);
  });

  it('ignores spotting, invalid dates and future starts without throwing', () => {
    const periods = [
      period('2025-01-01'),
      period('2025-01-15', { kind: 'spotting' }),
      period('2025-02-30'), // invalid
      period('not-a-date'),
      period('2025-01-29'),
      period('2025-02-26'),
      period('2099-01-01'), // future
    ];
    const p = predict(periods, { today: '2025-03-05' });
    expect(p.lastStart).toBe('2025-02-26');
    expect(p.cyclesUsed).toBe(2);
    expect(p.cycleLength).toBe(28);
  });

  it('unsorted input gives the same result as sorted input', () => {
    const sorted = history('2024-01-01', [27, 29, 31, 28, 30, 28]);
    const shuffled = [sorted[3]!, sorted[0]!, sorted[6]!, sorted[2]!, sorted[5]!, sorted[1]!, sorted[4]!];
    const a = predict(sorted, { today: '2024-07-15' });
    const b = predict(shuffled, { today: '2024-07-15' });
    expect(b.nextStart).toBe(a.nextStart);
    expect(b.halfWidth).toBe(a.halfWidth);
  });
});

describe('predict — lateness & recalculation', () => {
  it('flags when today is past the estimated range', () => {
    const periods = history('2025-01-01', [28, 28, 28]);
    const last = periods[periods.length - 1]!.start;
    const p = predict(periods, { today: addDays(last, 40) });
    expect(p.isLate).toBe(true);
    expect(p.daysUntilNext).toBeLessThan(0);
  });

  it('recalculates immediately when a new period is logged', () => {
    const periods = history('2025-01-01', [28, 28, 28]);
    const before = predict(periods, { today: '2025-04-20' });
    const actual = '2025-04-25'; // 30 days after the last start
    const after = predict([...periods, period(actual)], { today: actual });
    expect(after.lastStart).toBe(actual);
    expect(after.cycleDay).toBe(1);
    expect(after.nextStart).not.toBe(before.nextStart);
  });
});

describe('evaluatePrediction', () => {
  it('records the error between estimate and reality', () => {
    const periods = history('2025-01-01', [28, 28, 28]);
    const before = predict(periods, { today: '2025-03-30' });
    const check = evaluatePrediction(before, addDays(before.nextStart!, 2));
    expect(check).not.toBeNull();
    expect(check!.errorDays).toBe(2);
    expect(check!.withinRange).toBe(true);
  });

  it('ignores back-filled history and same-episode entries', () => {
    const periods = history('2025-01-01', [28, 28]);
    const before = predict(periods, { today: '2025-03-01' });
    expect(evaluatePrediction(before, '2024-12-01')).toBeNull();
    expect(evaluatePrediction(before, addDays(before.lastStart!, 2))).toBeNull();
  });

  it('repeated misses widen the range and lower confidence', () => {
    const periods = history('2024-01-01', [28, 28, 28, 28, 28, 28, 28]);
    const today = '2024-07-20';
    const plain = predict(periods, { today });
    const misses = [7, -6, 8].map((e) => ({
      previousStart: '2024-01-01',
      predictedStart: '2024-01-29',
      rangeStart: '2024-01-28',
      rangeEnd: '2024-01-30',
      actualStart: addDays('2024-01-29', e),
      errorDays: e,
      withinRange: false,
    }));
    const humbled = predict(periods, { today, checks: misses });
    expect(humbled.halfWidth).toBeGreaterThan(plain.halfWidth);
    expect(humbled.confidence).not.toBe('high');
  });
});

describe('phases and fertility estimate', () => {
  it('maps cycle days to phases', () => {
    expect(phaseFor(2, 28, 5)).toBe('menstrual');
    expect(phaseFor(8, 28, 5)).toBe('follicular');
    expect(phaseFor(14, 28, 5)).toBe('ovulatory');
    expect(phaseFor(22, 28, 5)).toBe('luteal');
    expect(phaseFor(33, 28, 5)).toBe('late');
  });

  it('places estimated ovulation ~14 days before the next period', () => {
    const w = approximateFertileWindow('2025-03-01', 28);
    expect(w.ovulation).toBe('2025-03-14');
    expect(diffDays(w.start, w.end)).toBe(6);
  });
});
