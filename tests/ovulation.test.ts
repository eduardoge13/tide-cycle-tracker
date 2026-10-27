import { describe, expect, it } from 'vitest';
import { addDays, diffDays } from '../src/lib/dates';
import { predict, phaseFor } from '../src/lib/prediction';
import { estimateLutealLength, nextOvulation, predictOvulation, DEFAULT_LUTEAL } from '../src/lib/ovulation';
import { buildDayMarks } from '../src/lib/calendar';
import { emptyData, type DayLog, type PeriodEntry } from '../src/lib/types';

let seq = 0;
const period = (start: string): PeriodEntry => ({
  id: `p${seq++}`, start, end: addDays(start, 4), kind: 'period', flow: 'medium', createdAt: '', updatedAt: '',
});
function history(first: string, lengths: number[]): PeriodEntry[] {
  const out = [period(first)];
  let s = first;
  for (const len of lengths) out.push(period((s = addDays(s, len))));
  return out;
}
/** A positive LH test on `cycleDay` of every completed cycle. */
function lhPositives(periods: PeriodEntry[], cycleDay: number): Record<string, DayLog> {
  const logs: Record<string, DayLog> = {};
  for (const p of periods.slice(0, -1)) {
    const d = addDays(p.start, cycleDay - 1);
    logs[d] = { date: d, lhTest: 'positive', updatedAt: '' };
  }
  return logs;
}

describe('estimateLutealLength', () => {
  it('uses the 14-day average when there are no ovulation tests', () => {
    const l = estimateLutealLength(history('2025-01-01', [28, 28, 28]), {});
    expect(l).toMatchObject({ length: DEFAULT_LUTEAL, personalized: false });
  });

  it('learns the luteal phase from positive LH tests', () => {
    // 30-day cycles, LH positive on day 17 → ovulation day 18 → luteal = days 19..30 = 12.
    const periods = history('2025-01-01', [30, 30, 30, 30]);
    const l = estimateLutealLength(periods, lhPositives(periods, 17));
    expect(l.personalized).toBe(true);
    expect(l.length).toBe(12);
    expect(l.samples).toEqual([12, 12, 12, 12]);
  });

  it('uses only the first positive of a cycle and ignores implausible ones', () => {
    const periods = history('2025-01-01', [30, 30]);
    const logs = lhPositives(periods, 17);
    // A second positive two days later in the same cycle must not count.
    const extra = addDays(periods[0]!.start, 18);
    logs[extra] = { date: extra, lhTest: 'positive', updatedAt: '' };
    // A positive on day 2 would imply a 27-day luteal phase: ignored.
    const odd = history('2025-06-01', [30]);
    const oddLog = addDays(odd[0]!.start, 1);
    logs[oddLog] = { date: oddLog, lhTest: 'positive', updatedAt: '' };
    const l = estimateLutealLength([...periods, ...odd], logs);
    expect(l.samples).toEqual([12, 12]);
  });

  it('negative tests teach nothing', () => {
    const periods = history('2025-01-01', [28, 28]);
    const logs: Record<string, DayLog> = { '2025-01-14': { date: '2025-01-14', lhTest: 'negative', updatedAt: '' } };
    expect(estimateLutealLength(periods, logs).personalized).toBe(false);
  });
});

describe('predictOvulation', () => {
  it('textbook case: 28-day cycles ovulate on cycle day 14', () => {
    const periods = history('2025-01-01', [28, 28, 28, 28, 28, 28, 28]);
    const today = addDays(periods.at(-1)!.start, 3);
    const p = predict(periods, { today });
    const f = predictOvulation(p, estimateLutealLength(periods, {}));
    expect(diffDays(p.lastStart!, f.current!.ovulation) + 1).toBe(14);
    expect(f.current!.fertileStart).toBe(addDays(f.current!.ovulation, -5));
    expect(f.current!.fertileEnd).toBe(addDays(f.current!.ovulation, 1));
    expect(phaseFor(14, 28, 5)).toBe('ovulatory');
  });

  it('counts back from the next period, so longer cycles ovulate later', () => {
    const periods = history('2025-01-01', [34, 34, 34]);
    const p = predict(periods, { today: addDays(periods.at(-1)!.start, 2) });
    const f = predictOvulation(p, estimateLutealLength(periods, {}));
    expect(diffDays(p.lastStart!, f.current!.ovulation) + 1).toBe(20); // 34 − 14
  });

  it('a learned luteal phase moves the estimate and can earn high confidence', () => {
    const periods = history('2025-01-01', [30, 30, 30, 30, 30, 30, 30, 30]);
    const p = predict(periods, { today: addDays(periods.at(-1)!.start, 2) });
    const generic = predictOvulation(p, estimateLutealLength(periods, {}));
    const learned = predictOvulation(p, estimateLutealLength(periods, lhPositives(periods, 17)));
    expect(diffDays(p.lastStart!, learned.current!.ovulation) + 1).toBe(18);
    expect(diffDays(generic.current!.ovulation, learned.current!.ovulation)).toBe(2);
    expect(generic.confidence).not.toBe('high'); // population average caps it
    expect(learned.confidence).toBe(p.confidence);
  });

  it('is always a range, and the range widens for later cycles', () => {
    const periods = history('2025-01-01', [27, 29, 28, 30, 27, 28]);
    const p = predict(periods, { today: addDays(periods.at(-1)!.start, 2) });
    const f = predictOvulation(p, estimateLutealLength(periods, {}));
    const width = (e: { rangeStart: string; rangeEnd: string }) => diffDays(e.rangeStart, e.rangeEnd);
    expect(width(f.current!)).toBeGreaterThanOrEqual(2);
    expect(width(f.upcoming[1]!)).toBeGreaterThan(width(f.current!));
  });

  it('never places ovulation inside the period on very short cycles', () => {
    const periods = history('2025-01-01', [18, 18, 18]);
    const p = predict(periods, { today: addDays(periods.at(-1)!.start, 2) });
    const f = predictOvulation(p, estimateLutealLength(periods, {}));
    expect(diffDays(p.lastStart!, f.current!.ovulation) + 1).toBeGreaterThan(p.periodLength);
  });

  it('nextOvulation skips a fertile window that has already passed', () => {
    const periods = history('2025-01-01', [28, 28, 28]);
    const today = addDays(periods.at(-1)!.start, 20);
    const p = predict(periods, { today });
    const f = predictOvulation(p, estimateLutealLength(periods, {}));
    expect(nextOvulation(f, today)).toEqual(f.upcoming[0]);
  });

  it('returns nothing without data', () => {
    const f = predictOvulation(predict([], { today: '2025-01-01' }), estimateLutealLength([], {}));
    expect(f.current).toBeNull();
    expect(f.upcoming).toEqual([]);
  });
});

describe('calendar marks for ovulation', () => {
  const periods = history('2025-01-01', [28, 28, 28]);
  const today = addDays(periods.at(-1)!.start, 3);
  const data = { ...emptyData(), periods };
  const p = predict(periods, { today });
  const f = predictOvulation(p, estimateLutealLength(periods, {}));

  it('marks the estimated ovulation day and fertile window, on by default', () => {
    const marks = buildDayMarks(data, p, today, f);
    expect(marks.get(f.current!.ovulation)?.ovulation).toBe(true);
    expect(marks.get(f.current!.fertileStart)?.fertile).toBe(true);
    expect(marks.get(addDays(f.current!.fertileStart, -1))?.fertile ?? false).toBe(false);
  });

  it('hides them when the setting is off', () => {
    const off = { ...data, settings: { ...data.settings, showOvulation: false } };
    const marks = buildDayMarks(off, p, today, f);
    expect([...marks.values()].some((m) => m.ovulation || m.fertile)).toBe(false);
  });
});
