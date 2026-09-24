import type { SQLiteDatabase } from "expo-sqlite";
import {
  isValidISODate,
  occurrencesBetween,
  type Frequency,
  type ISODate,
} from "../lib/dates";
import { isValidEntryAmount } from "../lib/money";
import { createEntry } from "./entriesDao";
import { createTransfer } from "./transfersDao";
import type {
  FeePaidBy,
  ID,
  PendingStatus,
  RecurringRule,
  RecurringType,
} from "../types";
import { SQL_NOW } from "./rows";

/** Recurring transactions (FR-11). Rules produce pending entries; nothing
 * touches a balance until the user confirms one (FR-11.4). */

export interface RecurringInput {
  type: RecurringType;
  amount: number;
  /** From-account for transfers. */
  accountId: ID;
  toAccountId: ID | null;
  categoryId: ID | null;
  fee: number;
  feePaidBy: FeePaidBy;
  note: string | null;
  frequency: Frequency;
  startDate: ISODate;
  endDate: ISODate | null;
}

interface RecurringRow {
  id: ID;
  type: RecurringType;
  amount: number;
  currency_code: "IDR";
  account_id: ID;
  to_account_id: ID | null;
  category_id: ID | null;
  fee: number;
  fee_paid_by: FeePaidBy;
  note: string | null;
  frequency: Frequency;
  start_date: string;
  end_date: string | null;
  archived: number;
}

function mapRule(row: RecurringRow): RecurringRule {
  return {
    id: row.id,
    type: row.type,
    amount: row.amount,
    currencyCode: row.currency_code,
    accountId: row.account_id,
    toAccountId: row.to_account_id,
    categoryId: row.category_id,
    fee: row.fee,
    feePaidBy: row.fee_paid_by,
    note: row.note,
    frequency: row.frequency,
    startDate: row.start_date,
    endDate: row.end_date,
    archived: row.archived === 1,
  };
}

/** Throws a short code the form can translate. */
export function validateRule(input: RecurringInput): void {
  if (!isValidEntryAmount(input.amount)) throw new Error("invalid_amount");
  if (!isValidISODate(input.startDate)) throw new Error("invalid_date");
  if (input.endDate !== null && !isValidISODate(input.endDate))
    throw new Error("invalid_date");
  if (input.endDate !== null && input.endDate < input.startDate)
    throw new Error("end_before_start");
  if (input.type === "transfer") {
    if (input.toAccountId === null) throw new Error("choose_accounts");
    if (input.toAccountId === input.accountId) throw new Error("same_account");
    if (input.feePaidBy === "recipient" && input.fee > input.amount)
      throw new Error("fee_exceeds_amount");
  } else if (input.categoryId === null) {
    throw new Error("choose_category");
  }
}

function cleanNote(note: string | null): string | null {
  const trimmed = note?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

export async function listRules(db: SQLiteDatabase): Promise<RecurringRule[]> {
  const rows = await db.getAllAsync<RecurringRow>(
    "SELECT * FROM recurring_rules ORDER BY archived, start_date DESC, id DESC",
  );
  return rows.map(mapRule);
}

export async function getRule(
  db: SQLiteDatabase,
  id: ID,
): Promise<RecurringRule | null> {
  const row = await db.getFirstAsync<RecurringRow>(
    "SELECT * FROM recurring_rules WHERE id = ?",
    id,
  );
  return row ? mapRule(row) : null;
}

/** FR-11.1 */
export async function createRule(
  db: SQLiteDatabase,
  input: RecurringInput,
): Promise<ID> {
  validateRule(input);
  const result = await db.runAsync(
    `INSERT INTO recurring_rules
       (type, amount, account_id, to_account_id, category_id, fee, fee_paid_by, note, frequency, start_date, end_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    input.type,
    input.amount,
    input.accountId,
    input.type === "transfer" ? input.toAccountId : null,
    input.type === "transfer" ? null : input.categoryId,
    input.type === "transfer" ? input.fee : 0,
    input.fee > 0 ? input.feePaidBy : "sender",
    cleanNote(input.note),
    input.frequency,
    input.startDate,
    input.endDate,
  );
  return result.lastInsertRowId;
}

/**
 * FR-11.7: a change applies to future occurrences only. Entries already
 * confirmed keep exactly what they were, and skipped occurrences stay
 * skipped; occurrences still waiting are dropped and generated again from
 * the new rule.
 */
export async function updateRule(
  db: SQLiteDatabase,
  id: ID,
  input: RecurringInput,
): Promise<void> {
  validateRule(input);
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE recurring_rules
          SET type = ?, amount = ?, account_id = ?, to_account_id = ?, category_id = ?, fee = ?,
              fee_paid_by = ?, note = ?, frequency = ?, start_date = ?, end_date = ?, updated_at = ${SQL_NOW}
        WHERE id = ?`,
      input.type,
      input.amount,
      input.accountId,
      input.type === "transfer" ? input.toAccountId : null,
      input.type === "transfer" ? null : input.categoryId,
      input.type === "transfer" ? input.fee : 0,
      input.fee > 0 ? input.feePaidBy : "sender",
      cleanNote(input.note),
      input.frequency,
      input.startDate,
      input.endDate,
      id,
    );
    await db.runAsync(
      "DELETE FROM pending_entries WHERE rule_id = ? AND status = 'pending'",
      id,
    );
  });
}

/** Rules are archived, so confirmed entries keep their link. */
export async function setRuleArchived(
  db: SQLiteDatabase,
  id: ID,
  archived: boolean,
): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE recurring_rules SET archived = ?, updated_at = ${SQL_NOW} WHERE id = ?`,
      archived ? 1 : 0,
      id,
    );
    if (archived) {
      await db.runAsync(
        "DELETE FROM pending_entries WHERE rule_id = ? AND status = 'pending'",
        id,
      );
    }
  });
}

/**
 * FR-11.2: add one pending entry per due occurrence, including any missed
 * while the app was closed. UNIQUE (rule_id, due_date) means an occurrence
 * can never be added twice, so this is safe to run on every app open.
 * Returns how many were added.
 */
export async function generatePendingEntries(
  db: SQLiteDatabase,
  today: ISODate,
): Promise<number> {
  const rules = (await listRules(db)).filter((r) => !r.archived);
  let added = 0;

  for (const rule of rules) {
    // Skip occurrences already handled, whatever their status.
    const last = await db.getFirstAsync<{ due_date: string }>(
      "SELECT MAX(due_date) AS due_date FROM pending_entries WHERE rule_id = ?",
      rule.id,
    );
    const dueDates = occurrencesBetween(rule.startDate, rule.frequency, today, {
      end: rule.endDate,
      after: last?.due_date ?? null,
    });
    for (const dueDate of dueDates) {
      await db.runAsync(
        "INSERT OR IGNORE INTO pending_entries (rule_id, due_date) VALUES (?, ?)",
        rule.id,
        dueDate,
      );
      added++;
    }
  }
  return added;
}

export interface PendingWithRule {
  id: ID;
  dueDate: ISODate;
  status: PendingStatus;
  rule: RecurringRule;
  /** Names for the list row. */
  accountName: string;
  toAccountName: string | null;
  categoryName: string | null;
  categoryI18nKey: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
}

/** FR-11.3: everything still waiting, oldest due date first. */
export async function listPendingEntries(
  db: SQLiteDatabase,
): Promise<PendingWithRule[]> {
  const rows = await db.getAllAsync<
    RecurringRow & {
      pending_id: ID;
      due_date: string;
      status: PendingStatus;
      account_name: string;
      to_account_name: string | null;
      category_name: string | null;
      category_i18n_key: string | null;
      category_icon: string | null;
      category_color: string | null;
    }
  >(
    `SELECT p.id AS pending_id, p.due_date, p.status, r.*,
            a.name AS account_name, ta.name AS to_account_name,
            c.name AS category_name, c.i18n_key AS category_i18n_key,
            c.icon AS category_icon, c.color AS category_color
       FROM pending_entries p
       JOIN recurring_rules r ON r.id = p.rule_id
       JOIN accounts a ON a.id = r.account_id
       LEFT JOIN accounts ta ON ta.id = r.to_account_id
       LEFT JOIN categories c ON c.id = r.category_id
      WHERE p.status = 'pending'
      ORDER BY p.due_date, p.id`,
  );
  return rows.map((row) => ({
    id: row.pending_id,
    dueDate: row.due_date,
    status: row.status,
    rule: mapRule(row),
    accountName: row.account_name,
    toAccountName: row.to_account_name,
    categoryName: row.category_name,
    categoryI18nKey: row.category_i18n_key,
    categoryIcon: row.category_icon,
    categoryColor: row.category_color,
  }));
}

export async function countPendingEntries(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>(
    "SELECT COUNT(*) AS n FROM pending_entries WHERE status = 'pending'",
  );
  return row?.n ?? 0;
}

/**
 * FR-11.4 and FR-11.5: create the real entry or transfer, dated the due
 * date, and mark the occurrence confirmed. The amount can be changed first;
 * everything else comes from the rule. One transaction (NFR-6).
 */
export async function confirmPendingEntry(
  db: SQLiteDatabase,
  pendingId: ID,
  overrides: { amount?: number; note?: string | null } = {},
): Promise<void> {
  const pending = await db.getFirstAsync<{
    rule_id: ID;
    due_date: string;
    status: PendingStatus;
  }>(
    "SELECT rule_id, due_date, status FROM pending_entries WHERE id = ?",
    pendingId,
  );
  if (!pending || pending.status !== "pending")
    throw new Error("pending_not_found");
  const rule = await getRule(db, pending.rule_id);
  if (!rule) throw new Error("pending_not_found");

  const amount = overrides.amount ?? rule.amount;
  if (!isValidEntryAmount(amount)) throw new Error("invalid_amount");
  const note =
    overrides.note === undefined ? rule.note : cleanNote(overrides.note);

  await db.withTransactionAsync(async () => {
    let entryId: ID | null = null;
    let transferId: ID | null = null;

    if (rule.type === "transfer") {
      transferId = await createTransfer(db, {
        fromAccountId: rule.accountId,
        toAccountId: rule.toAccountId!,
        amount,
        fee: rule.fee,
        feePaidBy: rule.feePaidBy,
        occurredOn: pending.due_date,
        note,
      });
      await db.runAsync(
        "UPDATE transfers SET recurring_rule_id = ? WHERE id = ?",
        rule.id,
        transferId,
      );
    } else {
      entryId = await createEntry(db, {
        type: rule.type,
        amount,
        accountId: rule.accountId,
        categoryId: rule.categoryId!,
        occurredOn: pending.due_date,
        note,
      });
      await db.runAsync(
        "UPDATE entries SET recurring_rule_id = ? WHERE id = ?",
        rule.id,
        entryId,
      );
    }

    await db.runAsync(
      `UPDATE pending_entries
          SET status = 'confirmed', entry_id = ?, transfer_id = ?, resolved_at = ${SQL_NOW}
        WHERE id = ?`,
      entryId,
      transferId,
      pendingId,
    );
  });
}

/** FR-11.4: skipping leaves balances untouched and never comes back. */
export async function skipPendingEntry(
  db: SQLiteDatabase,
  pendingId: ID,
): Promise<void> {
  await db.runAsync(
    `UPDATE pending_entries SET status = 'skipped', resolved_at = ${SQL_NOW} WHERE id = ? AND status = 'pending'`,
    pendingId,
  );
}
