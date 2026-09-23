import type { SQLiteDatabase } from "expo-sqlite";
import { getSchemaVersion } from "../db/migrations";
import {
  BACKUP_FORMAT,
  BACKUP_TABLES,
  COLUMNS,
  type BackupFile,
  type BackupRow,
  type BackupTable,
} from "./format";

/** FR-9.1: a full copy of every user table, with the schema version (FR-9.5). */
export async function exportBackup(
  db: SQLiteDatabase,
  exportedAt = new Date().toISOString(),
): Promise<BackupFile> {
  const data = {} as Record<BackupTable, BackupRow[]>;
  for (const table of BACKUP_TABLES) {
    const columns = Object.keys(COLUMNS[table]).join(", ");
    const order = table === "settings" ? "key" : "id";
    data[table] = await db.getAllAsync<BackupRow>(
      `SELECT ${columns} FROM ${table} ORDER BY ${order}`,
    );
  }
  return {
    format: BACKUP_FORMAT,
    schemaVersion: await getSchemaVersion(db),
    exportedAt,
    data,
  };
}

export type ImportMode = "replace" | "merge";

export interface ImportSummary {
  added: Record<BackupTable, number>;
  skipped: Record<BackupTable, number>;
}

function emptyCounts(): Record<BackupTable, number> {
  return Object.fromEntries(BACKUP_TABLES.map((t) => [t, 0])) as Record<
    BackupTable,
    number
  >;
}

async function insertRow(
  db: SQLiteDatabase,
  table: BackupTable,
  row: BackupRow,
  keepId: boolean,
): Promise<number> {
  const columns = Object.keys(COLUMNS[table]).filter(
    (c) => keepId || c !== "id",
  );
  const result = await db.runAsync(
    `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
    ...columns.map((c) => row[c] ?? null),
  );
  return result.lastInsertRowId;
}

/**
 * FR-9.4 "replace all data": delete everything, then restore the file with
 * its original ids. One transaction (FR-9.6): if any row fails, the delete
 * is rolled back too and the phone keeps its data.
 */
export async function importReplace(
  db: SQLiteDatabase,
  backup: BackupFile,
): Promise<ImportSummary> {
  const added = emptyCounts();
  await db.withTransactionAsync(async () => {
    // Children first, so no foreign key blocks a delete.
    for (const table of [
      "pending_entries",
      "goal_movements",
      "budget_alert_state",
      "account_alert_state",
      "budgets",
      "entries",
      "transfers",
      "recurring_rules",
      "goals",
      "categories",
      "accounts",
      "settings",
    ]) {
      await db.runAsync(`DELETE FROM ${table}`);
    }
    for (const table of BACKUP_TABLES) {
      for (const row of backup.data[table]) {
        await insertRow(db, table, row, true);
        added[table]++;
      }
    }
  });
  return { added, skipped: emptyCounts() };
}

type IdMap = Map<number, number>;

/**
 * FR-9.4 "merge and skip duplicates". A record is a duplicate when its uid is
 * already on the phone (decided). Records from older backups have no uid and
 * are matched by content instead. Accounts and categories with the same name
 * and type are treated as the same, so entries land on them. Ids in the file
 * are remapped to ids on this phone. Settings are left as they are.
 * One transaction (FR-9.6).
 */
export async function importMerge(
  db: SQLiteDatabase,
  backup: BackupFile,
): Promise<ImportSummary> {
  const added = emptyCounts();
  const skipped = emptyCounts();
  const maps = Object.fromEntries(
    BACKUP_TABLES.map((t) => [t, new Map()]),
  ) as Record<BackupTable, IdMap>;
  const map = (table: BackupTable, id: unknown): number | null =>
    id === null || id === undefined
      ? null
      : (maps[table].get(id as number) ?? null);

  const byUid = async (
    table: BackupTable,
    uid: unknown,
  ): Promise<number | null> => {
    if (uid === null || uid === undefined) return null;
    const row = await db.getFirstAsync<{ id: number }>(
      `SELECT id FROM ${table} WHERE uid = ?`,
      uid as string,
    );
    return row?.id ?? null;
  };

  const place = async (
    table: BackupTable,
    row: BackupRow,
    remapped: BackupRow,
    findExisting: () => Promise<number | null>,
  ) => {
    const existing = await findExisting();
    if (existing !== null) {
      maps[table].set(row.id as number, existing);
      skipped[table]++;
      return;
    }
    const newId = await insertRow(db, table, remapped, false);
    maps[table].set(row.id as number, newId);
    added[table]++;
  };

  await db.withTransactionAsync(async () => {
    for (const row of backup.data.accounts) {
      await place("accounts", row, row, async () => {
        const hit = await byUid("accounts", row.uid);
        if (hit !== null) return hit;
        const same = await db.getFirstAsync<{ id: number }>(
          "SELECT id FROM accounts WHERE name = ? COLLATE NOCASE AND type = ?",
          row.name as string,
          row.type as string,
        );
        return same?.id ?? null;
      });
    }

    for (const row of backup.data.categories) {
      await place("categories", row, row, async () => {
        if (row.builtin_key !== null) {
          const builtin = await db.getFirstAsync<{ id: number }>(
            "SELECT id FROM categories WHERE builtin_key = ?",
            row.builtin_key as string,
          );
          return builtin?.id ?? null;
        }
        const hit = await byUid("categories", row.uid);
        if (hit !== null) return hit;
        // Names are unique per type, so a same-named category must be the same one.
        const same = await db.getFirstAsync<{ id: number }>(
          "SELECT id FROM categories WHERE name = ? COLLATE NOCASE AND type = ?",
          row.name as string,
          row.type as string,
        );
        return same?.id ?? null;
      });
    }

    for (const row of backup.data.recurring_rules) {
      const remapped: BackupRow = {
        ...row,
        account_id: map("accounts", row.account_id),
        to_account_id: map("accounts", row.to_account_id),
        category_id: map("categories", row.category_id),
      };
      await place("recurring_rules", row, remapped, async () => {
        const hit = await byUid("recurring_rules", row.uid);
        if (hit !== null || row.uid !== null) return hit;
        const same = await db.getFirstAsync<{ id: number }>(
          `SELECT id FROM recurring_rules
            WHERE type = ? AND amount = ? AND account_id = ? AND to_account_id IS ? AND category_id IS ?
              AND frequency = ? AND start_date = ?`,
          remapped.type,
          remapped.amount,
          remapped.account_id,
          remapped.to_account_id,
          remapped.category_id,
          remapped.frequency,
          remapped.start_date,
        );
        return same?.id ?? null;
      });
    }

    for (const row of backup.data.goals) {
      const remapped: BackupRow = {
        ...row,
        linked_account_id: map("accounts", row.linked_account_id),
      };
      await place("goals", row, remapped, async () => {
        const hit = await byUid("goals", row.uid);
        if (hit !== null || row.uid !== null) return hit;
        const same = await db.getFirstAsync<{ id: number }>(
          "SELECT id FROM goals WHERE name = ? COLLATE NOCASE AND target_amount = ? AND measure = ?",
          remapped.name,
          remapped.target_amount,
          remapped.measure,
        );
        return same?.id ?? null;
      });
    }

    for (const row of backup.data.entries) {
      const remapped: BackupRow = {
        ...row,
        account_id: map("accounts", row.account_id),
        category_id: map("categories", row.category_id),
        recurring_rule_id: map("recurring_rules", row.recurring_rule_id),
      };
      await place("entries", row, remapped, async () => {
        const hit = await byUid("entries", row.uid);
        if (hit !== null || row.uid !== null) return hit; // has a uid: only a uid match is a duplicate
        const same = await db.getFirstAsync<{ id: number }>(
          `SELECT id FROM entries
            WHERE occurred_on = ? AND type = ? AND amount = ? AND account_id = ? AND category_id = ? AND note IS ?`,
          remapped.occurred_on,
          remapped.type,
          remapped.amount,
          remapped.account_id,
          remapped.category_id,
          remapped.note,
        );
        return same?.id ?? null;
      });
    }

    for (const row of backup.data.transfers) {
      const remapped: BackupRow = {
        ...row,
        from_account_id: map("accounts", row.from_account_id),
        to_account_id: map("accounts", row.to_account_id),
        recurring_rule_id: map("recurring_rules", row.recurring_rule_id),
      };
      await place("transfers", row, remapped, async () => {
        const hit = await byUid("transfers", row.uid);
        if (hit !== null || row.uid !== null) return hit;
        const same = await db.getFirstAsync<{ id: number }>(
          `SELECT id FROM transfers
            WHERE occurred_on = ? AND from_account_id = ? AND to_account_id = ? AND amount = ?
              AND fee = ? AND fee_paid_by = ? AND note IS ?`,
          remapped.occurred_on,
          remapped.from_account_id,
          remapped.to_account_id,
          remapped.amount,
          remapped.fee,
          remapped.fee_paid_by,
          remapped.note,
        );
        return same?.id ?? null;
      });
    }

    for (const row of backup.data.budgets) {
      const remapped: BackupRow = {
        ...row,
        category_id: map("categories", row.category_id),
        account_id: map("accounts", row.account_id),
      };
      await place("budgets", row, remapped, async () => {
        const hit = await byUid("budgets", row.uid);
        if (hit !== null) return hit;
        // One limit per target per start month: keep the phone's own.
        const same = await db.getFirstAsync<{ id: number }>(
          `SELECT id FROM budgets
            WHERE scope = ? AND IFNULL(category_id, 0) = IFNULL(?, 0) AND IFNULL(account_id, 0) = IFNULL(?, 0)
              AND start_month = ?`,
          remapped.scope,
          remapped.category_id,
          remapped.account_id,
          remapped.start_month,
        );
        return same?.id ?? null;
      });
    }

    for (const row of backup.data.goal_movements) {
      const remapped: BackupRow = {
        ...row,
        goal_id: map("goals", row.goal_id),
        account_id: map("accounts", row.account_id),
      };
      await place("goal_movements", row, remapped, async () => {
        const hit = await byUid("goal_movements", row.uid);
        if (hit !== null || row.uid !== null) return hit;
        const same = await db.getFirstAsync<{ id: number }>(
          `SELECT id FROM goal_movements
            WHERE goal_id = ? AND account_id = ? AND direction = ? AND amount = ? AND occurred_on = ? AND note IS ?`,
          remapped.goal_id,
          remapped.account_id,
          remapped.direction,
          remapped.amount,
          remapped.occurred_on,
          remapped.note,
        );
        return same?.id ?? null;
      });
    }

    for (const row of backup.data.pending_entries) {
      const remapped: BackupRow = {
        ...row,
        rule_id: map("recurring_rules", row.rule_id),
        entry_id: map("entries", row.entry_id),
        transfer_id: map("transfers", row.transfer_id),
      };
      await place("pending_entries", row, remapped, async () => {
        const hit = await byUid("pending_entries", row.uid);
        if (hit !== null) return hit;
        // An occurrence is never added twice (FR-11.2).
        const same = await db.getFirstAsync<{ id: number }>(
          "SELECT id FROM pending_entries WHERE rule_id = ? AND due_date = ?",
          remapped.rule_id,
          remapped.due_date,
        );
        return same?.id ?? null;
      });
    }

    skipped.settings = backup.data.settings.length; // merge keeps this phone's settings
  });

  return { added, skipped };
}
