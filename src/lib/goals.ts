/** Goal progress maths (FR-12.6). Pure, so it is easy to test. */
import { monthKey, type ISODate } from "./dates";

export interface GoalProgress {
  saved: number;
  target: number;
  /** Never below zero, even when the goal is over target. */
  remaining: number;
  /** Whole percent, rounded down, capped at 100 for the bar. */
  percent: number;
  /** Whole months from this month to the target month, at least 1. Null with no target date. */
  monthsLeft: number | null;
  /** What to put aside each month to reach the target in time. Null with no target date. */
  monthlyNeeded: number | null;
  /** The target date has passed and the goal is not reached. */
  overdue: boolean;
}

/** Whole months from `from` to `to`, counting the current month as one. */
export function monthsBetween(from: ISODate, to: ISODate): number {
  const [fy, fm] = monthKey(from).split("-").map(Number);
  const [ty, tm] = monthKey(to).split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

export function goalProgress(
  saved: number,
  target: number,
  targetDate: ISODate | null,
  todayDate: ISODate,
): GoalProgress {
  const remaining = Math.max(0, target - saved);
  const percent =
    target > 0 ? Math.min(100, Math.floor((saved * 100) / target)) : 0;

  if (targetDate === null) {
    return {
      saved,
      target,
      remaining,
      percent,
      monthsLeft: null,
      monthlyNeeded: null,
      overdue: false,
    };
  }
  const overdue = targetDate < todayDate && remaining > 0;
  // The target month counts, so a target this month leaves one month.
  const monthsLeft = Math.max(1, monthsBetween(todayDate, targetDate) + 1);
  return {
    saved,
    target,
    remaining,
    percent,
    monthsLeft,
    monthlyNeeded: remaining === 0 ? 0 : Math.ceil(remaining / monthsLeft),
    overdue,
  };
}
