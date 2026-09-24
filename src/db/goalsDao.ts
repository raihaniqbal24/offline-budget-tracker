import type { SQLiteDatabase } from "expo-sqlite";
import { isValidISODate, type ISODate } from "../lib/dates";
import { isValidEntryAmount } from "../lib/money";
import type {
  Goal,
  GoalMeasure,
  GoalMovement,
  GoalMovementDirection,
  ID,
} from "../types";
import { SQL_NOW } from "./rows";

/**
 * Savings goals (FR-12). A linked goal simply reports its account's balance.
 * A manual goal holds money through its movements: a contribution takes the
 * amount out of an account and a release puts it back, so the combined total
 * of accounts and goals never changes (FR-12.7). Movements are never
 * spending or income (FR-12.3), which v_cashflow already takes care of.
 */

export interface GoalInput {
  name: string;
  targetAmount: number;
  targetDate: ISODate | null;
  measure: GoalMeasure;
  linkedAccountId: ID | null;
}

interface GoalRow {
  id: ID;
  name: string;
  target_amount: number;
  currency_code: "IDR";
  target_date: string | null;
  measure: GoalMeasure;
  linked_account_id: ID | null;
  archived: number;
}

function mapGoal(row: GoalRow): Goal {
  return {
    id: row.id,
    name: row.name,
    targetAmount: row.target_amount,
    currencyCode: row.currency_code,
    targetDate: row.target_date,
    measure: row.measure,
    linkedAccountId: row.linked_account_id,
    archived: row.archived === 1,
  };
}

export function validateGoal(input: GoalInput): void {
  if (input.name.trim().length === 0) throw new Error("name_required");
  if (!isValidEntryAmount(input.targetAmount))
    throw new Error("invalid_amount");
  if (input.targetDate !== null && !isValidISODate(input.targetDate))
    throw new Error("invalid_date");
  if (input.measure === "linked" && input.linkedAccountId === null)
    throw new Error("choose_account");
}

export interface GoalWithProgress extends Goal {
  /** Money in the goal as of today: the linked account's balance, or the movements. */
  saved: number;
  linkedAccountName: string | null;
}

/** FR-12.1, FR-12.2: every goal with the money currently behind it. */
export async function listGoals(
  db: SQLiteDatabase,
  today: ISODate,
): Promise<GoalWithProgress[]> {
  const rows = await db.getAllAsync<
    GoalRow & { saved: number; linked_account_name: string | null }
  >(
    `SELECT g.*,
            a.name AS linked_account_name,
            CASE g.measure
              WHEN 'linked' THEN
                COALESCE(a.opening_balance, 0) + COALESCE((
                  SELECT SUM(m.delta) FROM v_account_movements m
                   WHERE m.account_id = g.linked_account_id AND m.occurred_on <= ?
                ), 0)
              ELSE COALESCE((
                SELECT SUM(CASE gm.direction WHEN 'contribution' THEN gm.amount ELSE -gm.amount END)
                  FROM goal_movements gm
                 WHERE gm.goal_id = g.id AND gm.occurred_on <= ?
              ), 0)
            END AS saved
       FROM goals g
       LEFT JOIN accounts a ON a.id = g.linked_account_id
      ORDER BY g.archived, g.id`,
    today,
    today,
  );
  return rows.map((row) => ({
    ...mapGoal(row),
    saved: row.saved,
    linkedAccountName: row.linked_account_name,
  }));
}

export async function getGoal(
  db: SQLiteDatabase,
  id: ID,
  today: ISODate,
): Promise<GoalWithProgress | null> {
  return (await listGoals(db, today)).find((g) => g.id === id) ?? null;
}

/** FR-12.5: the total held in manual goals, shown apart from account balances. */
export async function getTotalInGoals(
  db: SQLiteDatabase,
  today: ISODate,
): Promise<number> {
  const row = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(CASE direction WHEN 'contribution' THEN amount ELSE -amount END), 0) AS total
       FROM goal_movements WHERE occurred_on <= ?`,
    today,
  );
  return row?.total ?? 0;
}

export async function createGoal(
  db: SQLiteDatabase,
  input: GoalInput,
): Promise<ID> {
  validateGoal(input);
  const result = await db.runAsync(
    `INSERT INTO goals (name, target_amount, target_date, measure, linked_account_id)
     VALUES (?, ?, ?, ?, ?)`,
    input.name.trim(),
    input.targetAmount,
    input.targetDate,
    input.measure,
    input.measure === "linked" ? input.linkedAccountId : null,
  );
  return result.lastInsertRowId;
}

/**
 * The measure can't change once a goal holds money: switching a manual goal
 * to a linked one would strand its movements.
 */
export async function updateGoal(
  db: SQLiteDatabase,
  id: ID,
  input: GoalInput,
): Promise<void> {
  validateGoal(input);
  const movements = await db.getFirstAsync<{ n: number }>(
    "SELECT COUNT(*) AS n FROM goal_movements WHERE goal_id = ?",
    id,
  );
  const current = await db.getFirstAsync<{ measure: GoalMeasure }>(
    "SELECT measure FROM goals WHERE id = ?",
    id,
  );
  if ((movements?.n ?? 0) > 0 && current && current.measure !== input.measure) {
    throw new Error("measure_locked");
  }
  await db.runAsync(
    `UPDATE goals
        SET name = ?, target_amount = ?, target_date = ?, measure = ?, linked_account_id = ?, updated_at = ${SQL_NOW}
      WHERE id = ?`,
    input.name.trim(),
    input.targetAmount,
    input.targetDate,
    input.measure,
    input.measure === "linked" ? input.linkedAccountId : null,
    id,
  );
}

/** Goals are archived, so their movements and history stay. */
export async function setGoalArchived(
  db: SQLiteDatabase,
  id: ID,
  archived: boolean,
): Promise<void> {
  await db.runAsync(
    `UPDATE goals SET archived = ?, updated_at = ${SQL_NOW} WHERE id = ?`,
    archived ? 1 : 0,
    id,
  );
}

export interface MovementInput {
  goalId: ID;
  accountId: ID;
  direction: GoalMovementDirection;
  amount: number;
  occurredOn: ISODate;
  note: string | null;
}

export interface GoalMovementWithAccount extends GoalMovement {
  accountName: string;
}

export async function listMovements(
  db: SQLiteDatabase,
  goalId: ID,
): Promise<GoalMovementWithAccount[]> {
  const rows = await db.getAllAsync<{
    id: ID;
    goal_id: ID;
    account_id: ID;
    direction: GoalMovementDirection;
    amount: number;
    currency_code: "IDR";
    occurred_on: string;
    note: string | null;
    account_name: string;
  }>(
    `SELECT gm.*, a.name AS account_name
       FROM goal_movements gm JOIN accounts a ON a.id = gm.account_id
      WHERE gm.goal_id = ?
      ORDER BY gm.occurred_on DESC, gm.id DESC`,
    goalId,
  );
  return rows.map((row) => ({
    id: row.id,
    goalId: row.goal_id,
    accountId: row.account_id,
    direction: row.direction,
    amount: row.amount,
    currencyCode: row.currency_code,
    occurredOn: row.occurred_on,
    note: row.note,
    accountName: row.account_name,
  }));
}

/**
 * FR-12.3 and FR-12.4: move money between an account and a manual goal.
 * A release can't take out more than the goal holds.
 */
export async function addMovement(
  db: SQLiteDatabase,
  input: MovementInput,
  today: ISODate,
): Promise<ID> {
  if (!isValidEntryAmount(input.amount)) throw new Error("invalid_amount");
  if (!isValidISODate(input.occurredOn)) throw new Error("invalid_date");

  const goal = await getGoal(db, input.goalId, today);
  if (!goal) throw new Error("goal_not_found");
  if (goal.measure !== "manual") throw new Error("goal_is_linked");
  if (input.direction === "release" && input.amount > goal.saved)
    throw new Error("release_exceeds_goal");

  const trimmed = input.note?.trim() ?? "";
  const result = await db.runAsync(
    `INSERT INTO goal_movements (goal_id, account_id, direction, amount, occurred_on, note)
     VALUES (?, ?, ?, ?, ?, ?)`,
    input.goalId,
    input.accountId,
    input.direction,
    input.amount,
    input.occurredOn,
    trimmed.length > 0 ? trimmed : null,
  );
  return result.lastInsertRowId;
}

export async function deleteMovement(
  db: SQLiteDatabase,
  id: ID,
): Promise<void> {
  await db.runAsync("DELETE FROM goal_movements WHERE id = ?", id);
}
