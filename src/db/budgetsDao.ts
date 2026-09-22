import type { SQLiteDatabase } from "expo-sqlite";
import { endOfMonth, monthKey, type ISODate, type MonthKey } from "../lib/dates";
import type { BudgetLevel, BudgetScope, ID } from "../types";

/*
 * Monthly spending limits (FR-7). A budget row applies from its start month
 * until a later row for the same target replaces it (FR-7.2). amount NULL
 * means "no limit from this month on", so past months never change.
 */

export interface BudgetTarget {
  scope: BudgetScope;
  categoryId: ID | null;
  accountId: ID | null;
}

export interface BudgetProgress extends BudgetTarget {
  budgetId: ID;
  limit: number;
  spent: number;
  /** Whole percent, rounded down so 74.9% never shows as 75%. */
  percent: number;
  startMonth: MonthKey;
}

export function targetKey(t: BudgetTarget): string {
  return `${t.scope}:${t.categoryId ?? 0}:${t.accountId ?? 0}`;
}

const SAME_TARGET = `b2.scope = b.scope
  AND IFNULL(b2.category_id, 0) = IFNULL(b.category_id, 0)
  AND IFNULL(b2.account_id, 0) = IFNULL(b.account_id, 0)`;

/**
 * Limits in force for a month with spending counted against each (FR-7.3):
 * a category limit counts that category; account and overall limits count all
 * spending, including transfer fees and unrecorded spending. Spending dated
 * after `today` is left out until its date arrives.
 */
export async function getBudgetProgress(
  db: SQLiteDatabase,
  month: MonthKey,
  today: ISODate
): Promise<BudgetProgress[]> {
  const start = `${month}-01`;
  const monthEnd = endOfMonth(start);
  const end = monthEnd < today ? monthEnd : today;

  const rows = await db.getAllAsync<{
    id: ID;
    scope: BudgetScope;
    category_id: ID | null;
    account_id: ID | null;
    amount: number;
    start_month: string;
    spent: number;
  }>(
    `SELECT b.id, b.scope, b.category_id, b.account_id, b.amount, b.start_month,
            (SELECT COALESCE(SUM(f.amount), 0) FROM v_cashflow f
              WHERE f.flow = 'spending'
                AND f.occurred_on BETWEEN ? AND ?
                AND (b.scope = 'overall'
                     OR (b.scope = 'category' AND f.category_id = b.category_id)
                     OR (b.scope = 'account' AND f.account_id = b.account_id))) AS spent
       FROM budgets b
      WHERE b.start_month = (SELECT MAX(b2.start_month) FROM budgets b2
                              WHERE ${SAME_TARGET} AND b2.start_month <= ?)
        AND b.amount IS NOT NULL
      ORDER BY CASE b.scope WHEN 'overall' THEN 0 WHEN 'account' THEN 1 ELSE 2 END, b.id`,
    start,
    end,
    month
  );

  return rows.map((r) => ({
    budgetId: r.id,
    scope: r.scope,
    categoryId: r.category_id,
    accountId: r.account_id,
    limit: r.amount,
    spent: r.spent,
    percent: Math.floor((r.spent * 100) / r.amount),
    startMonth: r.start_month,
  }));
}

/**
 * Set or remove the limit for a target from `month` onward (FR-7.2).
 * Earlier months keep whatever limit applied to them.
 */
export async function setBudgetLimit(
  db: SQLiteDatabase,
  target: BudgetTarget,
  amount: number | null,
  month: MonthKey
): Promise<void> {
  if (amount !== null && (!Number.isSafeInteger(amount) || amount <= 0)) throw new Error("invalid_amount");
  const { scope, categoryId, accountId } = target;
  const matches = `scope = ? AND IFNULL(category_id, 0) = IFNULL(?, 0) AND IFNULL(account_id, 0) = IFNULL(?, 0)`;

  await db.withTransactionAsync(async () => {
    const current = await db.getFirstAsync<{ id: ID }>(
      `SELECT id FROM budgets WHERE ${matches} AND start_month = ?`,
      scope, categoryId, accountId, month
    );
    const earlier = await db.getFirstAsync<{ amount: number | null }>(
      `SELECT amount FROM budgets WHERE ${matches} AND start_month < ? ORDER BY start_month DESC LIMIT 1`,
      scope, categoryId, accountId, month
    );
    const inheritedLimit = earlier?.amount ?? null;

    if (amount === inheritedLimit) {
      // Same as what already applies: no row needed for this month.
      if (current) await db.runAsync("DELETE FROM budgets WHERE id = ?", current.id);
    } else if (current) {
      await db.runAsync("UPDATE budgets SET amount = ? WHERE id = ?", amount, current.id);
    } else {
      await db.runAsync(
        `INSERT INTO budgets (scope, category_id, account_id, amount, start_month) VALUES (?, ?, ?, ?, ?)`,
        scope, categoryId, accountId, amount, month
      );
    }
  });
}

export interface BudgetAlert extends BudgetProgress {
  level: BudgetLevel;
}

const LEVELS: BudgetLevel[] = [100, 90, 75];

/**
 * FR-7.5 and FR-7.6: find limits in the current month that have reached a
 * new warning level, record it, and return them. Each level is reported at
 * most once per limit per month; jumping several levels at once reports only
 * the highest. Limits on archived accounts or categories are skipped.
 * Phase 4 sends phone notifications from the same result.
 */
export async function checkBudgetAlerts(db: SQLiteDatabase, today: ISODate): Promise<BudgetAlert[]> {
  const month = monthKey(today);
  const progress = await getBudgetProgress(db, month, today);
  const alerts: BudgetAlert[] = [];

  for (const p of progress) {
    const level = LEVELS.find((l) => p.percent >= l);
    if (!level) continue;

    if (p.scope !== "overall") {
      const table = p.scope === "category" ? "categories" : "accounts";
      const row = await db.getFirstAsync<{ archived: number }>(
        `SELECT archived FROM ${table} WHERE id = ?`,
        p.scope === "category" ? p.categoryId : p.accountId
      );
      if (row?.archived === 1) continue;
    }

    const state = await db.getFirstAsync<{ last_level: number }>(
      "SELECT last_level FROM budget_alert_state WHERE budget_id = ? AND month = ?",
      p.budgetId,
      month
    );
    if (state && state.last_level >= level) continue;

    await db.runAsync(
      `INSERT OR REPLACE INTO budget_alert_state (budget_id, month, last_level) VALUES (?, ?, ?)`,
      p.budgetId,
      month,
      level
    );
    alerts.push({ ...p, level });
  }
  return alerts;
}
