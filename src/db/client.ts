import * as SQLite from "expo-sqlite";

export const DB_NAME = "budget_tracker.db";

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * The single app-wide connection. Caching the promise (not the database)
 * means two callers during startup share one open instead of racing.
 */
export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      // Must run outside a transaction; foreign keys are off by default in SQLite.
      await db.execAsync("PRAGMA journal_mode = WAL;");
      await db.execAsync("PRAGMA foreign_keys = ON;");
      return db;
    })().catch((error) => {
      dbPromise = null; // allow a retry after a failed open
      throw error;
    });
  }
  return dbPromise;
}
