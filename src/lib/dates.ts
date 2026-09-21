/**
 * Date utilities (SRS FR-2.2, FR-2.3, FR-3.1, FR-3.3, FR-11.6).
 *
 * Every business date is a local calendar date stored as "YYYY-MM-DD" text.
 * Dates are built from year/month/day parts, never from UTC timestamps, so
 * grouping never shifts with time zones or daylight saving.
 *
 * Never use SQLite's date('now') for "today": it is UTC, and in Indonesia
 * (UTC+7 to UTC+9) that is the wrong day before 07:00 local time.
 * Always pass today() from here into queries.
 */

export type ISODate = string; // "YYYY-MM-DD"
export type MonthKey = string; // "YYYY-MM"
export type PeriodType = "day" | "week" | "month" | "year";
export type Frequency = "daily" | "weekly" | "monthly" | "yearly";

export interface DateRange {
  start: ISODate; // inclusive
  end: ISODate; // inclusive
}

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/** Local calendar date of a JS Date. */
export function toISODate(date: Date): ISODate {
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function isValidISODate(value: string): boolean {
  const m = ISO_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1) return false;
  return d <= daysInMonth(y, mo);
}

/** Parse "YYYY-MM-DD" into a Date at local midnight. Throws on bad input. */
export function parseISODate(value: ISODate): Date {
  if (!isValidISODate(value)) throw new Error(`Invalid date: ${value}`);
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function parts(value: ISODate): [number, number, number] {
  if (!isValidISODate(value)) throw new Error(`Invalid date: ${value}`);
  const [y, m, d] = value.split("-").map(Number);
  return [y, m, d];
}

function fromParts(y: number, m: number, d: number): ISODate {
  // Date normalises overflow (e.g. day 32 -> next month), which addDays relies on.
  return toISODate(new Date(y, m - 1, d));
}

/** Days in a month, month 1-12. */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** Today's local date. Pass `now` in tests. */
export function today(now: Date = new Date()): ISODate {
  return toISODate(now);
}

export function yesterday(now: Date = new Date()): ISODate {
  return addDays(today(now), -1);
}

export function addDays(value: ISODate, days: number): ISODate {
  const [y, m, d] = parts(value);
  return fromParts(y, m, d + days);
}

/**
 * Add months, clamping to the last day of shorter months.
 * Pass `anchorDay` to keep the original day across a chain of months:
 * Jan 31 -> Feb 28 -> Mar 31, not Mar 28.
 */
export function addMonths(
  value: ISODate,
  months: number,
  anchorDay?: number,
): ISODate {
  const [y, m, d] = parts(value);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const day = Math.min(anchorDay ?? d, daysInMonth(ny, nm));
  return `${pad(ny, 4)}-${pad(nm)}-${pad(day)}`;
}

/** Compare two ISO dates; string comparison is correct for YYYY-MM-DD. */
export function compareDates(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Whole days from a to b (b - a). */
export function diffDays(a: ISODate, b: ISODate): number {
  const [ay, am, ad] = parts(a);
  const [by, bm, bd] = parts(b);
  const ms = Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad);
  return Math.round(ms / 86_400_000);
}

export function monthKey(value: ISODate): MonthKey {
  return value.slice(0, 7);
}

/** 1 = Monday ... 7 = Sunday */
export function isoWeekday(value: ISODate): number {
  const day = parseISODate(value).getDay(); // 0 = Sunday
  return day === 0 ? 7 : day;
}

/** Weeks start on Monday (FR-3.3). */
export function startOfWeek(value: ISODate): ISODate {
  return addDays(value, 1 - isoWeekday(value));
}

export function startOfMonth(value: ISODate): ISODate {
  return `${value.slice(0, 7)}-01`;
}

export function endOfMonth(value: ISODate): ISODate {
  const [y, m] = parts(value);
  return `${pad(y, 4)}-${pad(m)}-${pad(daysInMonth(y, m))}`;
}

/** The range covered by a period that contains `anchor`. */
export function getPeriodRange(type: PeriodType, anchor: ISODate): DateRange {
  switch (type) {
    case "day":
      return { start: anchor, end: anchor };
    case "week": {
      const start = startOfWeek(anchor);
      return { start, end: addDays(start, 6) };
    }
    case "month":
      return { start: startOfMonth(anchor), end: endOfMonth(anchor) };
    case "year": {
      const y = anchor.slice(0, 4);
      return { start: `${y}-01-01`, end: `${y}-12-31` };
    }
  }
}

/** Move a period anchor by `delta` periods (-1 = previous, +1 = next). */
export function shiftPeriod(
  type: PeriodType,
  anchor: ISODate,
  delta: number,
): ISODate {
  const { start } = getPeriodRange(type, anchor);
  switch (type) {
    case "day":
      return addDays(start, delta);
    case "week":
      return addDays(start, delta * 7);
    case "month":
      return addMonths(start, delta);
    case "year":
      return addMonths(start, delta * 12);
  }
}

/** True when the period containing `anchor` also contains today. */
export function isCurrentPeriod(
  type: PeriodType,
  anchor: ISODate,
  todayDate: ISODate,
): boolean {
  const { start, end } = getPeriodRange(type, anchor);
  return start <= todayDate && todayDate <= end;
}

/** The next arrow stops at the current period (FR-3.1). */
export function canGoToNextPeriod(
  type: PeriodType,
  anchor: ISODate,
  todayDate: ISODate,
): boolean {
  return getPeriodRange(type, anchor).end < todayDate;
}

/**
 * Days used for "average per day" (FR-3.4).
 * A past period divides by its full length; the current period divides by
 * the days elapsed so far, including today.
 */
export function daysForAverage(range: DateRange, todayDate: ISODate): number {
  if (todayDate < range.start) return 0;
  const end = todayDate < range.end ? todayDate : range.end;
  return diffDays(range.start, end) + 1;
}

/** Every date in a range, for filling empty days in trend charts. */
export function eachDay(range: DateRange): ISODate[] {
  const out: ISODate[] = [];
  for (let d = range.start; d <= range.end; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Every month key in a year, for the Year trend chart. */
export function eachMonthOfYear(year: number): MonthKey[] {
  return Array.from({ length: 12 }, (_, i) => `${pad(year, 4)}-${pad(i + 1)}`);
}

/**
 * The nth occurrence (0-based) of a recurring rule (FR-11.6).
 * Computed from the start date each time, never step by step, so a rule on
 * the 31st returns to the 31st after a short month.
 */
export function occurrenceDate(
  start: ISODate,
  frequency: Frequency,
  index: number,
): ISODate {
  const [, , day] = parts(start);
  switch (frequency) {
    case "daily":
      return addDays(start, index);
    case "weekly":
      return addDays(start, index * 7);
    case "monthly":
      return addMonths(start, index, day);
    case "yearly":
      return addMonths(start, index * 12, day);
  }
}

/**
 * All occurrences from `start` up to and including `until`, stopping at
 * `end` when the rule has one. `after` skips occurrences on or before a date
 * (e.g. the last one already generated).
 */
export function occurrencesBetween(
  start: ISODate,
  frequency: Frequency,
  until: ISODate,
  options: {
    end?: ISODate | null;
    after?: ISODate | null;
    limit?: number;
  } = {},
): ISODate[] {
  const { end = null, after = null, limit = 1000 } = options;
  const stop = end && end < until ? end : until;
  const out: ISODate[] = [];
  for (let i = 0; out.length < limit; i++) {
    const date = occurrenceDate(start, frequency, i);
    if (date > stop) break;
    if (after && date <= after) continue;
    out.push(date);
  }
  return out;
}
