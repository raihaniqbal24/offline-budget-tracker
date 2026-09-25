import type { SQLiteDatabase } from "expo-sqlite";
import { isValidISODate, type ISODate } from "../lib/dates";
import { isValidEntryAmount } from "../lib/money";
import type { Entry, ID } from "../types";
import { listAccountsWithBalances } from "./accountsDao";
import { getEntry } from "./entriesDao";
import { SQL_NOW } from "./rows";

/**
 * Reconciliation (FR-1.4 to FR-1.7). An adjustment is an entry of type
 * 'adjustment' on the built-in Unrecorded category, with a signed amount:
 * negative = unrecorded spending, positive = unrecorded income.
 */

async function unrecordedCategoryId(db: SQLiteDatabase): Promise<ID> {
  const row = await db.getFirstAsync<{ id: ID }>(
    "SELECT id FROM categories WHERE builtin_key = 'unrecorded'",
  );
  if (!row) throw new Error("missing_unrecorded_category");
  return row.id;
}

/**
 * FR-1.4: record the difference between the real balance and the app's
 * balance as of `onDate` (the day the user checked their bank or wallet),
 * dated that day. Returns the adjustment id, or null when the balances
 * already match. Future dates are refused: there is no real balance yet.
 */
export async function reconcileAccount(
  db: SQLiteDatabase,
  accountId: ID,
  realBalance: number,
  onDate: ISODate,
  today: ISODate = onDate,
): Promise<ID | null> {
  if (!Number.isSafeInteger(realBalance)) throw new Error("invalid_amount");
  if (!isValidISODate(onDate)) throw new Error("invalid_date");
  if (onDate > today) throw new Error("future_date");
  const account = (await listAccountsWithBalances(db, onDate)).find(
    (a) => a.id === accountId,
  );
  if (!account) throw new Error("account_not_found");

  const difference = realBalance - account.balance;
  if (difference === 0) return null;

  const result = await db.runAsync(
    `INSERT INTO entries (type, amount, account_id, category_id, occurred_on)
     VALUES ('adjustment', ?, ?, ?, ?)`,
    difference,
    accountId,
    await unrecordedCategoryId(db),
    onDate,
  );
  return result.lastInsertRowId;
}

async function getAdjustment(db: SQLiteDatabase, id: ID): Promise<Entry> {
  const entry = await getEntry(db, id);
  if (!entry || entry.type !== "adjustment")
    throw new Error("adjustment_not_found");
  return entry;
}

/** The entry type an adjustment becomes: its sign decides (FR-1.5). */
export function adjustmentEntryType(amount: number): "expense" | "income" {
  return amount < 0 ? "expense" : "income";
}

/**
 * FR-1.6: give the whole adjustment a category and note, turning it into a
 * normal expense or income in place (same id, date and account).
 */
export async function categorizeAdjustment(
  db: SQLiteDatabase,
  id: ID,
  categoryId: ID,
  note: string | null,
): Promise<void> {
  const adjustment = await getAdjustment(db, id);
  const trimmed = note?.trim() ?? "";
  await db.runAsync(
    `UPDATE entries
        SET type = ?, amount = ?, category_id = ?, note = ?, updated_at = ${SQL_NOW}
      WHERE id = ?`,
    adjustmentEntryType(adjustment.amount),
    Math.abs(adjustment.amount),
    categoryId,
    trimmed.length > 0 ? trimmed : null,
    id,
  );
}

export interface SplitPart {
  categoryId: ID;
  amount: number; // positive
  note: string | null;
}

/**
 * FR-1.7: turn part of an adjustment into categorized entries on the same
 * account and date. What is left stays as a smaller Unrecorded adjustment;
 * if nothing is left, the adjustment is removed. All in one transaction
 * (NFR-6), so a failure part-way leaves everything as it was.
 * Returns the remaining signed amount (0 when fully explained).
 */
export async function splitAdjustment(
  db: SQLiteDatabase,
  id: ID,
  parts: SplitPart[],
): Promise<number> {
  const adjustment = await getAdjustment(db, id);
  if (parts.length === 0) throw new Error("no_parts");
  if (parts.some((p) => !isValidEntryAmount(p.amount)))
    throw new Error("invalid_amount");

  const total = parts.reduce((sum, p) => sum + p.amount, 0);
  const available = Math.abs(adjustment.amount);
  if (total > available) throw new Error("split_exceeds_adjustment");

  const type = adjustmentEntryType(adjustment.amount);
  const sign = adjustment.amount < 0 ? -1 : 1;
  const unexplained = available - total;
  const remaining = unexplained === 0 ? 0 : sign * unexplained; // avoid -0

  await db.withTransactionAsync(async () => {
    for (const part of parts) {
      const trimmed = part.note?.trim() ?? "";
      await db.runAsync(
        `INSERT INTO entries (type, amount, account_id, category_id, occurred_on, note)
         VALUES (?, ?, ?, ?, ?, ?)`,
        type,
        part.amount,
        adjustment.accountId,
        part.categoryId,
        adjustment.occurredOn,
        trimmed.length > 0 ? trimmed : null,
      );
    }
    if (remaining === 0) {
      await db.runAsync("DELETE FROM entries WHERE id = ?", id);
    } else {
      await db.runAsync(
        `UPDATE entries SET amount = ?, updated_at = ${SQL_NOW} WHERE id = ?`,
        remaining,
        id,
      );
    }
  });

  return remaining;
}
