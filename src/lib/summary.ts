/**
 * Pure helpers for the summary screen (FR-3.1, FR-3.4, FR-3.5).
 * Totals themselves come from the database; this file only shapes them.
 */
import type { AppLanguage } from "./money";
import {
  daysForAverage,
  eachDay,
  eachMonthOfYear,
  type DateRange,
  type ISODate,
  type PeriodType,
} from "./dates";
import { formatDate, formatDayHeader, formatMonthYear } from "./dateLabels";

export interface Comparison {
  /** current - previous; positive means more spending than before */
  change: number;
  /** Whole percent, or null when the previous period had nothing to compare */
  percent: number | null;
}

/** Change against the previous period as an amount and a percentage (FR-3.4). */
export function compareWithPrevious(current: number, previous: number): Comparison {
  const change = current - previous;
  return { change, percent: previous > 0 ? Math.round((change / previous) * 100) : null };
}

/** Average spending per day; the current period divides by days elapsed (decided). */
export function averagePerDay(spending: number, range: DateRange, todayDate: ISODate): number {
  const days = daysForAverage(range, todayDate);
  return days > 0 ? Math.round(spending / days) : 0;
}

export interface TrendBar {
  key: string; // "YYYY-MM-DD" or "YYYY-MM"
  value: number;
}

/**
 * One bar per day for Week and Month, one per month for Year (FR-3.5), with
 * zero for buckets that had no spending. Day view has no trend chart.
 */
export function buildTrend(type: PeriodType, range: DateRange, data: Map<string, number>): TrendBar[] {
  if (type === "day") return [];
  const keys = type === "year" ? eachMonthOfYear(Number(range.start.slice(0, 4))) : eachDay(range);
  return keys.map((key) => ({ key, value: data.get(key) ?? 0 }));
}

/** Heading between the period arrows: "Today", "15 Sep – 21 Sep", "September 2026", "2026". */
export function periodLabel(type: PeriodType, range: DateRange, todayDate: ISODate, lang: AppLanguage): string {
  switch (type) {
    case "day":
      return formatDayHeader(range.start, todayDate, lang);
    case "week":
      return `${formatDate(range.start, lang, { todayDate })} – ${formatDate(range.end, lang, { todayDate })}`;
    case "month":
      return formatMonthYear(range.start, lang);
    case "year":
      return range.start.slice(0, 4);
  }
}

/** Share of the total as a whole percent, for the ranked breakdown list. */
export function shareOf(amount: number, total: number): number {
  return total > 0 ? Math.round((amount / total) * 100) : 0;
}