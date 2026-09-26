import type { SQLiteDatabase } from "expo-sqlite";
import type { DateRange, ISODate } from "../lib/dates";
import type { BuiltinCategoryKey, ID } from "../types";

/*
 * Period summaries (FR-3), all computed in the database (FR-3.10) from
 * v_cashflow, which already includes unrecorded adjustments and transfer
 * fees and leaves transfers out (FR-3.7, FR-5.5).
 *
 * Every query clips the range at `today`: future-dated entries count only
 * once their date arrives (decided for summaries).
 */

function clip(range: DateRange, today: ISODate): DateRange {
  return { start: range.start, end: range.end < today ? range.end : today };
}

export interface CategorySlice {
  categoryId: ID;
  name: string;
  i18nKey: string | null;
  icon: string;
  color: string;
  builtinKey: BuiltinCategoryKey | null;
  amount: number;
}

/** Spending per category, largest first. Unrecorded is its own line (FR-3.6). */
export async function getCategoryBreakdown(
  db: SQLiteDatabase,
  range: DateRange,
  today: ISODate,
  accountId: ID | null = null,
): Promise<CategorySlice[]> {
  const { start, end } = clip(range, today);
  const rows = await db.getAllAsync<{
    category_id: ID;
    name: string;
    i18n_key: string | null;
    icon: string;
    color: string;
    builtin_key: BuiltinCategoryKey | null;
    amount: number;
  }>(
    `SELECT f.category_id, c.name, c.i18n_key, c.icon, c.color, c.builtin_key, SUM(f.amount) AS amount
       FROM v_cashflow f
       JOIN categories c ON c.id = f.category_id
      WHERE f.flow = 'spending'
        AND f.occurred_on BETWEEN ? AND ?
        AND (? IS NULL OR f.account_id = ?)
      GROUP BY f.category_id
      ORDER BY amount DESC, c.sort_order`,
    start,
    end,
    accountId,
    accountId,
  );
  return rows.map((r) => ({
    categoryId: r.category_id,
    name: r.name,
    i18nKey: r.i18n_key,
    icon: r.icon,
    color: r.color,
    builtinKey: r.builtin_key,
    amount: r.amount,
  }));
}

/**
 * Spending per day (Week and Month views) or per month (Year view), FR-3.5.
 * Returns only buckets that have spending; the screen fills in zeros.
 */
export async function getSpendingTrend(
  db: SQLiteDatabase,
  range: DateRange,
  today: ISODate,
  bucket: "day" | "month",
  accountId: ID | null = null,
): Promise<Map<string, number>> {
  const { start, end } = clip(range, today);
  const key = bucket === "day" ? "occurred_on" : "substr(occurred_on, 1, 7)";
  const rows = await db.getAllAsync<{ bucket: string; amount: number }>(
    `SELECT ${key} AS bucket, SUM(amount) AS amount
       FROM v_cashflow
      WHERE flow = 'spending'
        AND occurred_on BETWEEN ? AND ?
        AND (? IS NULL OR account_id = ?)
      GROUP BY bucket`,
    start,
    end,
    accountId,
    accountId,
  );
  return new Map(rows.map((r) => [r.bucket, r.amount]));
}

/** Whether a period has any spending or income, for hiding the comparison (FR-3.9). */
export async function hasActivity(
  db: SQLiteDatabase,
  range: DateRange,
  today: ISODate,
  accountId: ID | null = null,
): Promise<boolean> {
  const { start, end } = clip(range, today);
  const row = await db.getFirstAsync<{ found: number }>(
    `SELECT EXISTS (
       SELECT 1 FROM v_cashflow
        WHERE occurred_on BETWEEN ? AND ?
          AND (? IS NULL OR account_id = ?)
     ) AS found`,
    start,
    end,
    accountId,
    accountId,
  );
  return (row?.found ?? 0) === 1;
}
