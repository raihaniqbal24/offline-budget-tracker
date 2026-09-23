import type { SQLiteDatabase } from "expo-sqlite";

/**
 * Migration 2 — a globally unique id (uid) on every user record.
 *
 * Row ids are per-install counters, so id 5 on one phone and id 5 on another
 * are different records. Backups carry the uid instead, and merge import
 * (FR-9.4) treats two records as the same only when their uids match.
 *
 * Existing rows get a random uid. New rows get one from an AFTER INSERT
 * trigger, so no insert statement in the app has to change. A row inserted
 * with an explicit uid (undo, import) keeps it.
 */
export const UID_TABLES = [
  "accounts",
  "categories",
  "recurring_rules",
  "entries",
  "transfers",
  "budgets",
  "goals",
  "goal_movements",
  "pending_entries",
] as const;

/** 32 random hex characters: 128 bits, like a UUID without dashes. */
export const SQL_NEW_UID = "lower(hex(randomblob(16)))";

export function uidSchemaSql(table: string): string {
  return `
ALTER TABLE ${table} ADD COLUMN uid TEXT;
UPDATE ${table} SET uid = ${SQL_NEW_UID} WHERE uid IS NULL;
CREATE UNIQUE INDEX ux_${table}_uid ON ${table} (uid);
CREATE TRIGGER trg_${table}_uid
AFTER INSERT ON ${table}
WHEN NEW.uid IS NULL
BEGIN
  UPDATE ${table} SET uid = ${SQL_NEW_UID} WHERE id = NEW.id;
END;
`;
}

export async function up(db: SQLiteDatabase): Promise<void> {
  for (const table of UID_TABLES) {
    await db.execAsync(uidSchemaSql(table));
  }
  // Settings introduced in phase 4, with defaults.
  await db.execAsync(`
INSERT OR IGNORE INTO settings (key, value) VALUES ('alerts_enabled', '0');
INSERT OR IGNORE INTO settings (key, value) VALUES ('last_backup_at', '');
`);
}
