import type { SQLiteDatabase } from "expo-sqlite";
import * as m001 from "./001_initial";

/**
 * Ordered list of migrations. Migration N (1-based) moves the database from
 * user_version N-1 to N. Never edit a migration that has shipped to a phone;
 * add a new one instead (SRS data rules, NFR-8).
 */
type Migration = (db: SQLiteDatabase) => Promise<void>;

const MIGRATIONS: Migration[] = [
  m001.up, // 1: initial SRS data model
];

export const LATEST_SCHEMA_VERSION = MIGRATIONS.length;

export async function getSchemaVersion(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number }>(
    "PRAGMA user_version;",
  );
  return row?.user_version ?? 0;
}

/**
 * Bring the database up to LATEST_SCHEMA_VERSION.
 * Each migration and its version bump run in one transaction, so a failed
 * migration leaves the database exactly as it was.
 */
export async function runMigrations(db: SQLiteDatabase): Promise<number> {
  const current = await getSchemaVersion(db);

  if (current > LATEST_SCHEMA_VERSION) {
    throw new Error(
      `Database schema v${current} is newer than this app (v${LATEST_SCHEMA_VERSION}). ` +
        "Install the latest version of the app.",
    );
  }

  for (let version = current + 1; version <= LATEST_SCHEMA_VERSION; version++) {
    await db.withTransactionAsync(async () => {
      await MIGRATIONS[version - 1](db);
      await db.execAsync(`PRAGMA user_version = ${version};`);
    });
  }

  return LATEST_SCHEMA_VERSION;
}
