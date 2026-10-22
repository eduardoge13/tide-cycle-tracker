/**
 * Date-only helpers.
 *
 * Every date in the app is a calendar date string `YYYY-MM-DD` with no time
 * and no timezone. Internally we convert to a "day number" (days since
 * 1970-01-01 in UTC) so arithmetic never crosses a DST boundary or shifts a
 * day when the device travels between timezones.
 */

export type ISODate = string;

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;
/** Fixed to the UI language so dates never mix languages with the copy. */
const LOCALE = 'es-MX';

export function isValidISODate(value: unknown): value is ISODate {
  if (typeof value !== 'string') return false;
  const m = ISO_RE.exec(value);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 1900 || y > 2200) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export function toDayNumber(iso: ISODate): number {
  const m = ISO_RE.exec(iso);
  if (!m) throw new RangeError('Invalid date');
  return Math.round(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / MS_PER_DAY);
}

export function fromDayNumber(day: number): ISODate {
  const dt = new Date(day * MS_PER_DAY);
  const y = String(dt.getUTCFullYear()).padStart(4, '0');
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(iso: ISODate, days: number): ISODate {
  return fromDayNumber(toDayNumber(iso) + days);
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function diffDays(from: ISODate, to: ISODate): number {
  return toDayNumber(to) - toDayNumber(from);
}

/** Today's calendar date in the device's local timezone. */
export function todayISO(now: Date = new Date()): ISODate {
  const y = String(now.getFullYear()).padStart(4, '0');
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function minDate(a: ISODate, b: ISODate): ISODate {
  return a <= b ? a : b;
}

export function maxDate(a: ISODate, b: ISODate): ISODate {
  return a >= b ? a : b;
}

/** 0 = Sunday … 6 = Saturday. 1970-01-01 was a Thursday. */
export function weekday(iso: ISODate): number {
  return (((toDayNumber(iso) + 4) % 7) + 7) % 7;
}

export function monthKey(iso: ISODate): string {
  return iso.slice(0, 7);
}

export function firstOfMonth(year: number, monthIndex: number): ISODate {
  return fromDayNumber(Math.round(Date.UTC(year, monthIndex, 1) / MS_PER_DAY));
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

export function eachDay(start: ISODate, end: ISODate): ISODate[] {
  const out: ISODate[] = [];
  const a = toDayNumber(start);
  const b = toDayNumber(end);
  for (let n = a; n <= b; n++) out.push(fromDayNumber(n));
  return out;
}

function asUTCDate(iso: ISODate): Date {
  return new Date(toDayNumber(iso) * MS_PER_DAY);
}

export function formatDate(iso: ISODate, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }): string {
  return new Intl.DateTimeFormat(LOCALE, { ...opts, timeZone: 'UTC' }).format(asUTCDate(iso));
}

export function formatLong(iso: ISODate): string {
  return formatDate(iso, { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' });
}

/** "10–14 de marzo" or "30 mar – 3 abr" — never pretends to be one exact date. */
export function formatRange(start: ISODate, end: ISODate): string {
  if (start === end) return formatDate(start, { month: 'long', day: 'numeric' });
  if (monthKey(start) === monthKey(end)) {
    return `${formatDate(start, { day: 'numeric' })}–${formatDate(end, { month: 'long', day: 'numeric' })}`;
  }
  return `${formatDate(start)} – ${formatDate(end)}`;
}
