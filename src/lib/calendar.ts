import { addDays, eachDay, isValidISODate, minDate, type ISODate } from './dates';
import type { Prediction } from './prediction';
import type { OvulationForecast } from './ovulation';
import type { AppData } from './types';

export type DayMark = {
  period: boolean;
  spotting: boolean;
  predicted: boolean;
  fertile: boolean;
  ovulation: boolean;
  hasLog: boolean;
};

const blank = (): DayMark => ({ period: false, spotting: false, predicted: false, fertile: false, ovulation: false, hasLog: false });

/**
 * Build a date → marks map for the calendar. Confirmed data (periods, spotting,
 * daily bleeding logs) is never overwritten by predictions.
 */
export function buildDayMarks(
  data: AppData,
  prediction: Prediction,
  today: ISODate,
  ovulation?: OvulationForecast,
): Map<ISODate, DayMark> {
  const marks = new Map<ISODate, DayMark>();
  const get = (d: ISODate) => {
    let m = marks.get(d);
    if (!m) marks.set(d, (m = blank()));
    return m;
  };

  for (const p of data.periods) {
    if (!isValidISODate(p.start) || p.start > today) continue;
    const fallbackEnd = minDate(addDays(p.start, (p.kind === 'period' ? prediction.periodLength : 1) - 1), today);
    const end = p.end && isValidISODate(p.end) && p.end >= p.start ? p.end : fallbackEnd;
    for (const d of eachDay(p.start, end)) {
      if (p.kind === 'period') get(d).period = true;
      else get(d).spotting = true;
    }
  }

  for (const log of Object.values(data.dayLogs)) {
    const m = get(log.date);
    m.hasLog = true;
    if (log.bleeding === 'spotting') m.spotting = true;
    else if (log.bleeding && log.bleeding !== 'none') m.period = true;
  }

  for (const up of prediction.upcoming) {
    for (const d of eachDay(up.start, up.end)) {
      if (d <= today) continue; // only the future is predicted
      const m = get(d);
      if (!m.period) m.predicted = true;
    }
  }

  if (data.settings.showOvulation && ovulation) {
    for (const est of [ovulation.current, ...ovulation.upcoming]) {
      if (!est) continue;
      for (const d of eachDay(est.fertileStart, est.fertileEnd)) {
        const m = get(d);
        if (!m.period) m.fertile = true;
      }
      const o = get(est.ovulation);
      if (!o.period) o.ovulation = true;
    }
  }

  return marks;
}
