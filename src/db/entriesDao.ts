import type { SQLiteDatabase } from "expo-sqlite";
import type { DateRange, ISODate } from "../lib/dates";
import { isValidISODate } from "../lib/dates";
import { isValidEntryAmount } from "../lib/money";
import type { BuiltinCategoryKey, Entry, EntryType, ID } from "../types";
import { mapEntry, SQL_NOW, type EntryRow } from "./rows";

/** What the entry form saves. Adjustments are created by reconciliation (phase 2). */
export interface EntryInput {
  type: "expense" | "income";
  amount: number;
  accountId: ID;
  categoryId: ID;
  occurredOn: ISODate;
  note: string | null;
}

export interface EntryWithDetails extends Entry {
  categoryName: string;
  categoryI18nKey: string | null;
  categoryIcon: string;
  categoryColor: string;
  categoryBuiltinKey: BuiltinCategoryKey | null;
  accountName: string;
}

type EntryDetailsRow = EntryRow & {
  category_name: string;
  category_i18n_key: string | null;
  category_icon: string;
  category_color: string;
  category_builtin_key: BuiltinCategoryKey | null;
  account_name: string;
};

function assertValid(input: EntryInput): void {
  if (!isValidEntryAmount(input.amount)) throw new Error("invalid_amount");
  if (!isValidISODate(input.occurredOn)) throw new Error("invalid_date");
}

function cleanNote(note: string | null): string | null {
  const trimmed = note?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

export async function createEntry(
  db: SQLiteDatabase,
  input: EntryInput,
): Promise<ID> {
  assertValid(input);
  const result = await db.runAsync(
    `INSERT INTO entries (type, amount, account_id, category_id, occurred_on, note)
     VALUES (?, ?, ?, ?, ?, ?)`,
    input.type,
    input.amount,
    input.accountId,
    input.categoryId,
    input.occurredOn,
    cleanNote(input.note),
  );
  return result.lastInsertRowId;
}

export async function updateEntry(
  db: SQLiteDatabase,
  id: ID,
  input: EntryInput,
): Promise<void> {
  assertValid(input);
  await db.runAsync(
    `UPDATE entries
        SET type = ?, amount = ?, account_id = ?, category_id = ?, occurred_on = ?, note = ?,
            updated_at = ${SQL_NOW}
      WHERE id = ?`,
    input.type,
    input.amount,
    input.accountId,
    input.categoryId,
    input.occurredOn,
    cleanNote(input.note),
    id,
  );
}

export async function getEntry(
  db: SQLiteDatabase,
  id: ID,
): Promise<Entry | null> {
  const row = await db.getFirstAsync<EntryRow>(
    "SELECT * FROM entries WHERE id = ?",
    id,
  );
  return row ? mapEntry(row) : null;
}

/** Deletes an entry and returns it, so it can be restored by undo (FR-2.7). */
export async function deleteEntry(
  db: SQLiteDatabase,
  id: ID,
): Promise<Entry | null> {
  const entry = await getEntry(db, id);
  if (!entry) return null;
  await db.runAsync("DELETE FROM entries WHERE id = ?", id);
  return entry;
}

/** Puts a deleted entry back exactly as it was, with the same id and timestamps. */
export async function restoreEntry(
  db: SQLiteDatabase,
  entry: Entry,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO entries
       (id, type, amount, currency_code, account_id, category_id, occurred_on, note,
        recurring_rule_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    entry.id,
    entry.type,
    entry.amount,
    entry.currencyCode,
    entry.accountId,
    entry.categoryId,
    entry.occurredOn,
    entry.note,
    entry.recurringRuleId,
    entry.createdAt,
  );
}

export interface ListEntriesOptions {
  limit: number;
  offset?: number;
  accountId?: ID | null;
  /** Inclusive date range; omit for all dates. */
  range?: DateRange | null;
  type?: EntryType | null;
}

const DETAILS_SELECT = `SELECT e.*,
            c.name AS category_name, c.i18n_key AS category_i18n_key,
            c.icon AS category_icon, c.color AS category_color,
            c.builtin_key AS category_builtin_key,
            a.name AS account_name
       FROM entries e
       JOIN categories c ON c.id = e.category_id
       JOIN accounts a ON a.id = e.account_id`;

function mapDetails(row: EntryDetailsRow): EntryWithDetails {
  return {
    ...mapEntry(row),
    categoryName: row.category_name,
    categoryI18nKey: row.category_i18n_key,
    categoryIcon: row.category_icon,
    categoryColor: row.category_color,
    categoryBuiltinKey: row.category_builtin_key,
    accountName: row.account_name,
  };
}

/** Newest first, with category and account details for list rows. */
export async function listEntries(db: SQLiteDatabase, options: ListEntriesOptions): Promise<EntryWithDetails[]> {
  const { limit, offset = 0, accountId = null, range = null, type = null } = options;
  const rows = await db.getAllAsync<EntryDetailsRow>(
    `${DETAILS_SELECT}
      WHERE (? IS NULL OR e.account_id = ?)
        AND (? IS NULL OR e.occurred_on BETWEEN ? AND ?)
        AND (? IS NULL OR e.type = ?)
      ORDER BY e.occurred_on DESC, e.id DESC
      LIMIT ? OFFSET ?`,
    accountId,
    accountId,
    range?.start ?? null,
    range?.start ?? null,
    range?.end ?? null,
    type,
    type,
    limit,
    offset,
  );
  return rows.map(mapDetails);
}

/** Entries with details for a set of ids (order not guaranteed). */
export async function listEntriesByIds(
  db: SQLiteDatabase,
  ids: ID[],
): Promise<EntryWithDetails[]> {
  if (ids.length === 0) return [];
  const rows = await db.getAllAsync<EntryDetailsRow>(
    `${DETAILS_SELECT} WHERE e.id IN (${ids.map(() => "?").join(", ")})`,
    ...ids
  );
  return rows.map(mapDetails);
}

export interface PeriodTotals {
  spending: number;
  income: number;
  net: number;
}

/**
 * Spending and income in a date range, from v_cashflow (so transfer fees and
 * unrecorded adjustments count, and transfers do not). Future-dated entries
 * are left out until their date arrives, as decided for summaries.
 */
export async function getPeriodTotals(
  db: SQLiteDatabase,
  range: DateRange,
  today: ISODate,
  accountId: ID | null = null,
): Promise<PeriodTotals> {
  const end = range.end < today ? range.end : today;
  const row = await db.getFirstAsync<{ spending: number; income: number }>(
    `SELECT COALESCE(SUM(CASE flow WHEN 'spending' THEN amount END), 0) AS spending,
            COALESCE(SUM(CASE flow WHEN 'income' THEN amount END), 0) AS income
       FROM v_cashflow
      WHERE occurred_on BETWEEN ? AND ?
        AND (? IS NULL OR account_id = ?)`,
    range.start,
    end,
    accountId,
    accountId,
  );
  const spending = row?.spending ?? 0;
  const income = row?.income ?? 0;
  return { spending, income, net: income - spending };
}
