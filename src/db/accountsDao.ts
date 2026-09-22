import type { SQLiteDatabase } from "expo-sqlite";
import type { AccountType, AccountWithBalance, ID } from "../types";
import type { ISODate } from "../lib/dates";
import { mapAccount, SQL_NOW, type AccountRow } from "./rows";

export interface AccountInput {
  name: string;
  type: AccountType;
  openingBalance: number;
  alertLine: number | null;
}

/**
 * Every account with its balance as of `today` (FR-1.2, FR-2.3):
 * opening balance plus every movement dated today or earlier. Movements come
 * from v_account_movements, the single balance calculation shared by entries,
 * adjustments, transfers and goal movements.
 */
export async function listAccountsWithBalances(
  db: SQLiteDatabase,
  today: ISODate,
): Promise<AccountWithBalance[]> {
  const rows = await db.getAllAsync<AccountRow & { balance: number }>(
    `SELECT a.*,
            a.opening_balance + COALESCE((
              SELECT SUM(m.delta) FROM v_account_movements m
               WHERE m.account_id = a.id AND m.occurred_on <= ?
            ), 0) AS balance
       FROM accounts a
      ORDER BY a.archived, a.sort_order, a.id`,
    today,
  );
  return rows.map((row) => {
    const account = mapAccount(row);
    return {
      ...account,
      balance: row.balance,
      // FR-10.3: at or below the line, including below zero
      isBelowAlertLine:
        account.alertLine !== null && row.balance <= account.alertLine,
    };
  });
}

export async function createAccount(
  db: SQLiteDatabase,
  input: AccountInput,
): Promise<ID> {
  const result = await db.runAsync(
    `INSERT INTO accounts (name, type, opening_balance, alert_line, sort_order)
     VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM accounts))`,
    input.name.trim(),
    input.type,
    input.openingBalance,
    input.alertLine,
  );
  return result.lastInsertRowId;
}

export async function updateAccount(
  db: SQLiteDatabase,
  id: ID,
  input: AccountInput,
): Promise<void> {
  await db.runAsync(
    `UPDATE accounts
        SET name = ?, type = ?, opening_balance = ?, alert_line = ?, updated_at = ${SQL_NOW}
      WHERE id = ?`,
    input.name.trim(),
    input.type,
    input.openingBalance,
    input.alertLine,
    id,
  );
}

/** Accounts are archived, never deleted, so history stays intact (FR-1.8). */
export async function setAccountArchived(
  db: SQLiteDatabase,
  id: ID,
  archived: boolean,
): Promise<void> {
  await db.runAsync(
    `UPDATE accounts SET archived = ?, updated_at = ${SQL_NOW} WHERE id = ?`,
    archived ? 1 : 0,
    id,
  );
}
