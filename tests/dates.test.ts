import { describe, expect, it } from 'vitest';
import { addDays, diffDays, formatRange, isValidISODate, todayISO, weekday } from '../src/lib/dates';

describe('dates', () => {
  it('validates real calendar dates only', () => {
    expect(isValidISODate('2024-02-29')).toBe(true);
    expect(isValidISODate('2025-02-29')).toBe(false);
    expect(isValidISODate('2025-13-01')).toBe(false);
    expect(isValidISODate('2025-1-01')).toBe(false);
    expect(isValidISODate('2025-01-01T00:00:00Z')).toBe(false);
    expect(isValidISODate(20250101)).toBe(false);
  });

  it('does day arithmetic across DST changes and month ends', () => {
    expect(addDays('2025-03-08', 2)).toBe('2025-03-10'); // US DST start
    expect(addDays('2025-10-25', 3)).toBe('2025-10-28'); // EU DST end
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2024-12-31', 1)).toBe('2025-01-01');
    expect(diffDays('2025-01-01', '2025-03-01')).toBe(59);
  });

  it('uses local calendar components for "today"', () => {
    // 23:30 local time must still be that local date.
    expect(todayISO(new Date(2025, 5, 15, 23, 30))).toBe('2025-06-15');
    expect(todayISO(new Date(2025, 5, 15, 0, 5))).toBe('2025-06-15');
  });

  it('knows the weekday', () => {
    expect(weekday('1970-01-01')).toBe(4);
    expect(weekday('2025-06-15')).toBe(0); // a Sunday
  });

  it('formats ranges without implying one exact date', () => {
    expect(formatRange('2025-03-10', '2025-03-14')).toMatch(/10.*14/);
    expect(formatRange('2025-03-30', '2025-04-03')).toMatch(/30.*3/);
  });
});
