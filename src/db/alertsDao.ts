import type { SQLiteDatabase } from "expo-sqlite";
import type { AccountWithBalance } from "../types";

/**
 * FR-10.4 and FR-10.5: an account "crosses" when it goes from above its alert
 * line to at or below it. Each crossing is reported once; another is reported
 * only after the balance has risen above the line and dropped again.
 * Returns the accounts that crossed since the last check, and records the
 * current state of every active account.
 */
export async function checkBalanceAlerts(
  db: SQLiteDatabase,
  accounts: AccountWithBalance[],
): Promise<AccountWithBalance[]> {
  const rows = await db.getAllAsync<{ account_id: number; is_below: number }>(
    "SELECT account_id, is_below FROM account_alert_state",
  );
  const wasBelow = new Map(rows.map((r) => [r.account_id, r.is_below === 1]));
  const crossed: AccountWithBalance[] = [];

  for (const account of accounts) {
    if (account.archived) continue;
    const below = account.isBelowAlertLine;
    const before = wasBelow.get(account.id);
    if (below && before !== true) crossed.push(account);
    if (before !== below) {
      await db.runAsync(
        `INSERT INTO account_alert_state (account_id, is_below, last_balance, checked_at)
         VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         ON CONFLICT (account_id) DO UPDATE SET
           is_below = excluded.is_below, last_balance = excluded.last_balance, checked_at = excluded.checked_at`,
        account.id,
        below ? 1 : 0,
        account.balance,
      );
    }
  }
  return crossed;
}
