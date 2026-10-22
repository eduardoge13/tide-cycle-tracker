import { describe, expect, it } from 'vitest';
import { addDays } from '../src/lib/dates';
import { buildDayMarks } from '../src/lib/calendar';
import { predict, buildSamples } from '../src/lib/prediction';
import { computeStats } from '../src/lib/stats';
import { emptyData, type PeriodEntry } from '../src/lib/types';

function period(start: string, end?: string, kind: PeriodEntry['kind'] = 'period'): PeriodEntry {
  return { id: `${kind}-${start}`, start, ...(end ? { end } : {}), kind, flow: 'medium', createdAt: '', updatedAt: '' };
}

describe('computeStats', () => {
  it('summarises cycles and periods, ignoring excluded gaps', () => {
    const starts = ['2025-01-01', '2025-01-29', '2025-02-26', '2025-03-28', '2025-08-01'];
    const samples = buildSamples(starts); // 28, 28, 30, then a 126-day gap (excluded)
    const periods = [period('2025-01-01', '2025-01-05'), period('2025-01-29', '2025-02-01')];
    const s = computeStats(samples, periods);
    expect(s.cyclesTracked).toBe(3);
    expect(s.medianCycle).toBe(28);
    expect(s.averageCycle).toBe(28.7);
    expect(s.shortest?.length).toBe(28);
    expect(s.longest?.length).toBe(30);
    expect(s.averagePeriod).toBe(4.5); // 5 and 4 days
  });

  it('reports a trend only with six or more cycles', () => {
    const shortHistory = computeStats(buildSamples(['2025-01-01', '2025-01-29', '2025-02-26']), []);
    expect(shortHistory.trend).toBeNull();

    let s = '2024-01-01';
    const starts = [s];
    for (const len of [30, 30, 30, 26, 26, 26]) starts.push((s = addDays(s, len)));
    expect(computeStats(buildSamples(starts), []).trend).toBe('shorter');
  });
});

describe('buildDayMarks', () => {
  const today = '2025-03-10';
  const data = emptyData();
  data.periods = [
    period('2025-01-01', '2025-01-05'),
    period('2025-01-29', '2025-02-02'),
    period('2025-02-26', '2025-03-02'),
    period('2025-02-14', '2025-02-14', 'spotting'),
  ];
  data.dayLogs['2025-03-05'] = { date: '2025-03-05', feeling: 4, updatedAt: '' };
  const p = predict(data.periods, { today });
  const marks = buildDayMarks(data, p, today);

  it('marks confirmed period and spotting days', () => {
    expect(marks.get('2025-02-26')?.period).toBe(true);
    expect(marks.get('2025-03-02')?.period).toBe(true);
    expect(marks.get('2025-03-03')?.period).toBeFalsy();
    expect(marks.get('2025-02-14')?.spotting).toBe(true);
    expect(marks.get('2025-03-05')?.hasLog).toBe(true);
  });

  it('predicts only future days and never overwrites confirmed ones', () => {
    expect(marks.get(p.nextStart!)?.predicted).toBe(true);
    for (const [date, m] of marks) {
      if (m.predicted) {
        expect(date > today).toBe(true);
        expect(m.period).toBe(false);
      }
    }
  });

  it('adds the fertile estimate only when the setting is on', () => {
    expect([...marks.values()].some((m) => m.fertile)).toBe(false);
    const withFertility = { ...data, settings: { ...data.settings, showFertility: true } };
    expect([...buildDayMarks(withFertility, p, today).values()].some((m) => m.fertile)).toBe(true);
  });
});
