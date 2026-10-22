import { addDays, type ISODate } from './dates';
import { emptyData, type AppData, type DayLog, type PeriodEntry, type Settings } from './types';

/**
 * Fictional sample history ending near `today`. Only loaded when the user
 * explicitly taps "Load demo data".
 */
export function buildDemoData(today: ISODate, settings?: Settings): AppData {
  // Oldest → newest; one long outlier cycle (41) to show damping.
  const lengths = [29, 28, 30, 27, 41, 29, 28, 30];
  const total = lengths.reduce((a, b) => a + b, 0);
  let start = addDays(today, -(total + 9));
  const stamp = new Date().toISOString();
  const periods: PeriodEntry[] = [];
  const flows: PeriodEntry['flow'][] = ['medium', 'heavy', 'medium', 'light', 'medium', 'heavy', 'medium', 'medium', 'heavy'];

  for (let i = 0; i <= lengths.length; i++) {
    const duration = 4 + (i % 3 === 0 ? 1 : 0);
    periods.push({
      id: `demo-${i}`,
      start,
      end: addDays(start, duration - 1),
      kind: 'period',
      flow: flows[i] ?? 'medium',
      createdAt: stamp,
      updatedAt: stamp,
    });
    if (i === 3) {
      periods.push({
        id: 'demo-spot',
        start: addDays(start, 14),
        end: addDays(start, 14),
        kind: 'spotting',
        flow: 'light',
        notes: 'Light spotting mid-cycle (demo).',
        createdAt: stamp,
        updatedAt: stamp,
      });
    }
    const len = lengths[i];
    if (len !== undefined) start = addDays(start, len);
  }

  const last = periods[periods.length - 1]!.start;
  const logs: DayLog[] = [
    { date: last, bleeding: 'heavy', cramps: true, pain: 2, moods: ['sensitive'], energy: 2, sleep: 3, updatedAt: stamp },
    { date: addDays(last, 1), bleeding: 'medium', cramps: true, pain: 1, energy: 3, bloating: true, updatedAt: stamp },
    { date: addDays(last, 6), bleeding: 'none', moods: ['happy', 'calm'], energy: 4, sleep: 4, notes: 'Good run this morning (demo).', updatedAt: stamp },
  ];

  const data = emptyData();
  data.periods = periods;
  data.dayLogs = Object.fromEntries(logs.filter((l) => l.date <= today).map((l) => [l.date, l]));
  if (settings) data.settings = { ...settings };
  return data;
}
