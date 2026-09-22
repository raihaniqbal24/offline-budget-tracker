import type { SQLiteDatabase } from "expo-sqlite";
import type { DateRange, ISODate } from "../lib/dates";
import { isValidISODate } from "../lib/dates";
import { isValidEntryAmount } from "../lib/money";
import type { FeePaidBy, ID, Transfer } from "../types";
import { mapTransfer, SQL_NOW, type TransferRow } from "./rows";

export interface TransferInput {
  fromAccountId: ID;
  toAccountId: ID;
  amount: number;
  fee: number;
  feePaidBy: FeePaidBy;
  occurredOn: ISODate;
  note: string | null;
}

export interface TransferWithDetails extends Transfer {
  fromAccountName: string;
  toAccountName: string;
}

/** Throws a short code the form can translate. */
export function validateTransfer(input: TransferInput): void {
  if (input.fromAccountId === input.toAccountId) throw new Error("same_account");
  if (!isValidEntryAmount(input.amount)) throw new Error("invalid_amount");
  if (!Number.isSafeInteger(input.fee) || input.fee < 0) throw new Error("invalid_fee");
  // FR-5.4: the recipient receives amount minus fee, which can't go below zero.
  if (input.feePaidBy === "recipient" && input.fee > input.amount) throw new Error("fee_exceeds_amount");
  if (!isValidISODate(input.occurredOn)) throw new Error("invalid_date");
}

function cleanNote(note: string | null): string | null {
  const trimmed = note?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * One record per transfer keeps both sides in sync (FR-5). Balance effects
 * come from v_account_movements; the fee counts as spending under Transfer
 * fees through v_cashflow (FR-5.3 to FR-5.5).
 */
export async function createTransfer(db: SQLiteDatabase, input: TransferInput): Promise<ID> {
  validateTransfer(input);
  const result = await db.runAsync(
    `INSERT INTO transfers (from_account_id, to_account_id, amount, fee, fee_paid_by, occurred_on, note)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    input.fromAccountId,
    input.toAccountId,
    input.amount,
    input.fee,
    input.fee > 0 ? input.feePaidBy : "sender",
    input.occurredOn,
    cleanNote(input.note)
  );
  return result.lastInsertRowId;
}

/** FR-5.7: editing the single record updates both balances. */
export async function updateTransfer(db: SQLiteDatabase, id: ID, input: TransferInput): Promise<void> {
  validateTransfer(input);
  await db.runAsync(
    `UPDATE transfers
        SET from_account_id = ?, to_account_id = ?, amount = ?, fee = ?, fee_paid_by = ?,
            occurred_on = ?, note = ?, updated_at = ${SQL_NOW}
      WHERE id = ?`,
    input.fromAccountId,
    input.toAccountId,
    input.amount,
    input.fee,
    input.fee > 0 ? input.feePaidBy : "sender",
    input.occurredOn,
    cleanNote(input.note),
    id
  );
}

export async function getTransfer(db: SQLiteDatabase, id: ID): Promise<Transfer | null> {
  const row = await db.getFirstAsync<TransferRow>("SELECT * FROM transfers WHERE id = ?", id);
  return row ? mapTransfer(row) : null;
}

export async function deleteTransfer(db: SQLiteDatabase, id: ID): Promise<Transfer | null> {
  const transfer = await getTransfer(db, id);
  if (!transfer) return null;
  await db.runAsync("DELETE FROM transfers WHERE id = ?", id);
  return transfer;
}

export async function restoreTransfer(db: SQLiteDatabase, t: Transfer): Promise<void> {
  await db.runAsync(
    `INSERT INTO transfers
       (id, from_account_id, to_account_id, amount, fee, fee_paid_by, currency_code, occurred_on,
        note, recurring_rule_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    t.id,
    t.fromAccountId,
    t.toAccountId,
    t.amount,
    t.fee,
    t.feePaidBy,
    t.currencyCode,
    t.occurredOn,
    t.note,
    t.recurringRuleId,
    t.createdAt
  );
}

/** FR-5.6: newest first, optionally for one account (either side) and a date range. */
export async function listTransfers(
  db: SQLiteDatabase,
  options: { limit: number; offset?: number; accountId?: ID | null; range?: DateRange | null }
): Promise<TransferWithDetails[]> {
  const { limit, offset = 0, accountId = null, range = null } = options;
  const rows = await db.getAllAsync<TransferRow & { from_name: string; to_name: string }>(
    `SELECT t.*, fa.name AS from_name, ta.name AS to_name
       FROM transfers t
       JOIN accounts fa ON fa.id = t.from_account_id
       JOIN accounts ta ON ta.id = t.to_account_id
      WHERE (? IS NULL OR t.from_account_id = ? OR t.to_account_id = ?)
        AND (? IS NULL OR t.occurred_on BETWEEN ? AND ?)
      ORDER BY t.occurred_on DESC, t.id DESC
      LIMIT ? OFFSET ?`,
    accountId,
    accountId,
    accountId,
    range?.start ?? null,
    range?.start ?? null,
    range?.end ?? null,
    limit,
    offset
  );
  return rows.map((row) => ({
    ...mapTransfer(row),
    fromAccountName: row.from_name,
    toAccountName: row.to_name,
  }));
}

/** What a transfer does to each side, for the form's preview line. */
export function transferEffect(input: Pick<TransferInput, "amount" | "fee" | "feePaidBy">): {
  fromDelta: number;
  toDelta: number;
} {
  const senderPays = input.feePaidBy === "sender";
  return {
    fromDelta: -(input.amount + (senderPays ? input.fee : 0)),
    toDelta: input.amount - (senderPays ? 0 : input.fee),
  };
}