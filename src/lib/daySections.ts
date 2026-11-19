import type { ISODate } from "./dates";

export interface DaySection<T> {
  date: ISODate;
  data: T[];
  /** Spending among the day's rows, as a positive number. */
  spending: number;
  income: number;
  /** False while more of this day may still be on the next page. */
  complete: boolean;
}

/**
 * Group a newest-first list into days, with each day's spending and income.
 *
 * `signedOf` returns a row's amount (negative = spending, positive = income),
 * or null for rows that count in neither, such as transfers. Rows of one day
 * are always adjacent, so only the last day can be cut off by paging: with
 * `hasMore` it is marked incomplete, and its totals should stay hidden until
 * the next page shows whether it continues.
 */
export function groupByDay<T>(
  rows: T[],
  dateOf: (row: T) => ISODate,
  signedOf: (row: T) => number | null,
  hasMore: boolean,
): DaySection<T>[] {
  const out: DaySection<T>[] = [];
  for (const row of rows) {
    const date = dateOf(row);
    let section = out[out.length - 1];
    if (!section || section.date !== date) {
      section = { date, data: [], spending: 0, income: 0, complete: true };
      out.push(section);
    }
    section.data.push(row);
    const amount = signedOf(row);
    if (amount !== null) {
      if (amount < 0) section.spending += -amount;
      else section.income += amount;
    }
  }
  if (hasMore && out.length > 0) out[out.length - 1].complete = false;
  return out;
}
