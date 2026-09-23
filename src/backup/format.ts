/**
 * The JSON backup file (FR-9.1, FR-9.5): its shape, validation and
 * migration of older versions. Pure functions, no database access.
 *
 * Rows are stored exactly as the database holds them (snake_case columns),
 * so a backup is a faithful copy that later schema versions can migrate.
 */

export const BACKUP_FORMAT = "budget-tracker-backup";

/** Tables in a backup, parents before children (the order they are restored in). */
export const BACKUP_TABLES = [
  "accounts",
  "categories",
  "recurring_rules",
  "goals",
  "entries",
  "transfers",
  "budgets",
  "goal_movements",
  "pending_entries",
  "settings",
] as const;

export type BackupTable = (typeof BACKUP_TABLES)[number];
export type BackupRow = Record<string, string | number | null>;

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  /** Database schema version the data came from (PRAGMA user_version). */
  schemaVersion: number;
  exportedAt: string;
  data: Record<BackupTable, BackupRow[]>;
}

type ColumnKind = "int" | "text" | "int?" | "text?";

/** Columns every row must have, per table, as of schema version 2. */
export const COLUMNS: Record<BackupTable, Record<string, ColumnKind>> = {
  accounts: {
    id: "int",
    uid: "text?",
    name: "text",
    type: "text",
    opening_balance: "int",
    alert_line: "int?",
    currency_code: "text",
    sort_order: "int",
    archived: "int",
    created_at: "text",
    updated_at: "text",
  },
  categories: {
    id: "int",
    uid: "text?",
    name: "text",
    type: "text",
    icon: "text",
    color: "text",
    sort_order: "int",
    archived: "int",
    builtin_key: "text?",
    i18n_key: "text?",
    created_at: "text",
    updated_at: "text",
  },
  recurring_rules: {
    id: "int",
    uid: "text?",
    type: "text",
    amount: "int",
    currency_code: "text",
    account_id: "int",
    to_account_id: "int?",
    category_id: "int?",
    fee: "int",
    fee_paid_by: "text",
    note: "text?",
    frequency: "text",
    start_date: "text",
    end_date: "text?",
    archived: "int",
    created_at: "text",
    updated_at: "text",
  },
  goals: {
    id: "int",
    uid: "text?",
    name: "text",
    target_amount: "int",
    currency_code: "text",
    target_date: "text?",
    measure: "text",
    linked_account_id: "int?",
    archived: "int",
    created_at: "text",
    updated_at: "text",
  },
  entries: {
    id: "int",
    uid: "text?",
    type: "text",
    amount: "int",
    currency_code: "text",
    account_id: "int",
    category_id: "int",
    occurred_on: "text",
    note: "text?",
    recurring_rule_id: "int?",
    created_at: "text",
    updated_at: "text",
  },
  transfers: {
    id: "int",
    uid: "text?",
    from_account_id: "int",
    to_account_id: "int",
    amount: "int",
    fee: "int",
    fee_paid_by: "text",
    currency_code: "text",
    occurred_on: "text",
    note: "text?",
    recurring_rule_id: "int?",
    created_at: "text",
    updated_at: "text",
  },
  budgets: {
    id: "int",
    uid: "text?",
    scope: "text",
    category_id: "int?",
    account_id: "int?",
    amount: "int?",
    currency_code: "text",
    start_month: "text",
    created_at: "text",
  },
  goal_movements: {
    id: "int",
    uid: "text?",
    goal_id: "int",
    account_id: "int",
    direction: "text",
    amount: "int",
    currency_code: "text",
    occurred_on: "text",
    note: "text?",
    created_at: "text",
  },
  pending_entries: {
    id: "int",
    uid: "text?",
    rule_id: "int",
    due_date: "text",
    status: "text",
    entry_id: "int?",
    transfer_id: "int?",
    created_at: "text",
    resolved_at: "text?",
  },
  settings: { key: "text", value: "text" },
};

/** References checked inside the file: [table, column, referenced table]. */
const REFERENCES: [BackupTable, string, BackupTable][] = [
  ["recurring_rules", "account_id", "accounts"],
  ["recurring_rules", "to_account_id", "accounts"],
  ["recurring_rules", "category_id", "categories"],
  ["goals", "linked_account_id", "accounts"],
  ["entries", "account_id", "accounts"],
  ["entries", "category_id", "categories"],
  ["entries", "recurring_rule_id", "recurring_rules"],
  ["transfers", "from_account_id", "accounts"],
  ["transfers", "to_account_id", "accounts"],
  ["transfers", "recurring_rule_id", "recurring_rules"],
  ["budgets", "category_id", "categories"],
  ["budgets", "account_id", "accounts"],
  ["goal_movements", "goal_id", "goals"],
  ["goal_movements", "account_id", "accounts"],
  ["pending_entries", "rule_id", "recurring_rules"],
  ["pending_entries", "entry_id", "entries"],
  ["pending_entries", "transfer_id", "transfers"],
];

export type ValidationResult =
  | { ok: true; backup: BackupFile }
  | { ok: false; error: string; detail?: string };

function kindMatches(value: unknown, kind: ColumnKind): boolean {
  const optional = kind.endsWith("?");
  if (value === null || value === undefined) return optional;
  if (kind.startsWith("int"))
    return typeof value === "number" && Number.isSafeInteger(value);
  return typeof value === "string";
}

/**
 * Bring an older backup up to the current layout (FR-9.5). Each step moves a
 * file one schema version forward, mirroring the database migrations.
 */
export function migrateBackup(
  backup: BackupFile,
  targetVersion: number,
): BackupFile {
  let current: BackupFile = { ...backup, data: { ...backup.data } };
  while (current.schemaVersion < targetVersion) {
    switch (current.schemaVersion) {
      case 1: {
        // v1 -> v2: rows gain a uid. Old rows have none; import matches them by content.
        const data = { ...current.data };
        for (const table of BACKUP_TABLES) {
          if (table === "settings") continue;
          data[table] = (data[table] ?? []).map((row) =>
            "uid" in row ? row : { ...row, uid: null },
          );
        }
        current = { ...current, data, schemaVersion: 2 };
        break;
      }
      default:
        throw new Error(`no_backup_migration_from_${current.schemaVersion}`);
    }
  }
  return current;
}

/**
 * FR-9.3: check a parsed file completely before anything is written. Accepts
 * files from schema version 1 up to `currentVersion`, migrating older ones.
 */
export function validateBackup(
  input: unknown,
  currentVersion: number,
): ValidationResult {
  if (typeof input !== "object" || input === null)
    return { ok: false, error: "not_a_backup" };
  const raw = input as Partial<BackupFile>;
  if (raw.format !== BACKUP_FORMAT) return { ok: false, error: "not_a_backup" };
  if (
    !Number.isSafeInteger(raw.schemaVersion) ||
    (raw.schemaVersion as number) < 1
  ) {
    return { ok: false, error: "not_a_backup" };
  }
  if ((raw.schemaVersion as number) > currentVersion)
    return { ok: false, error: "newer_version" };
  if (typeof raw.data !== "object" || raw.data === null)
    return { ok: false, error: "not_a_backup" };

  for (const table of BACKUP_TABLES) {
    if (!Array.isArray((raw.data as Record<string, unknown>)[table])) {
      return { ok: false, error: "missing_table", detail: table };
    }
  }

  const backup = migrateBackup(raw as BackupFile, currentVersion);

  // Every row has every column, with the right kind of value. Extra columns are dropped.
  const data = {} as Record<BackupTable, BackupRow[]>;
  for (const table of BACKUP_TABLES) {
    const columns = COLUMNS[table];
    const rows: BackupRow[] = [];
    for (const [index, row] of backup.data[table].entries()) {
      if (typeof row !== "object" || row === null)
        return { ok: false, error: "bad_row", detail: `${table}[${index}]` };
      const clean: BackupRow = {};
      for (const [column, kind] of Object.entries(columns)) {
        const value = (row as BackupRow)[column];
        if (!kindMatches(value, kind)) {
          return {
            ok: false,
            error: "bad_row",
            detail: `${table}[${index}].${column}`,
          };
        }
        clean[column] = value ?? null;
      }
      rows.push(clean);
    }
    data[table] = rows;
  }

  // Ids and uids are unique within each table.
  for (const table of BACKUP_TABLES) {
    if (table === "settings") continue;
    const ids = new Set<number>();
    const uids = new Set<string>();
    for (const row of data[table]) {
      if (ids.has(row.id as number))
        return { ok: false, error: "duplicate_id", detail: table };
      ids.add(row.id as number);
      if (row.uid !== null) {
        if (uids.has(row.uid as string))
          return { ok: false, error: "duplicate_id", detail: table };
        uids.add(row.uid as string);
      }
    }
  }

  // Every reference points at a row in the same file.
  const idsOf = new Map(
    BACKUP_TABLES.map((t) => [t, new Set(data[t].map((r) => r.id as number))]),
  );
  for (const [table, column, target] of REFERENCES) {
    for (const [index, row] of data[table].entries()) {
      const ref = row[column];
      if (ref !== null && !idsOf.get(target)!.has(ref as number)) {
        return {
          ok: false,
          error: "broken_reference",
          detail: `${table}[${index}].${column}`,
        };
      }
    }
  }

  // The built-in categories must be there; the app relies on them.
  const builtins = new Set(
    data.categories.map((c) => c.builtin_key).filter(Boolean),
  );
  if (!builtins.has("unrecorded") || !builtins.has("transfer_fees")) {
    return { ok: false, error: "missing_builtin_categories" };
  }

  return { ok: true, backup: { ...backup, data } };
}

/** Row counts shown before the user confirms an import. */
export function backupCounts(backup: BackupFile) {
  return {
    accounts: backup.data.accounts.length,
    categories: backup.data.categories.filter((c) => c.builtin_key === null)
      .length,
    entries: backup.data.entries.length,
    transfers: backup.data.transfers.length,
    budgets: backup.data.budgets.length,
    goals: backup.data.goals.length,
    recurringRules: backup.data.recurring_rules.length,
  };
}
