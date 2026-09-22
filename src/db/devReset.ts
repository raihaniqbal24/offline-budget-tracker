import type { SQLiteDatabase } from "expo-sqlite";

/**
 * DEVELOPMENT ONLY. Drops every table, view and trigger and resets the schema
 * version to 0, so the next start-up builds the database from scratch.
 * All data in the app is lost. The start-up error screen offers this only
 * when __DEV__ is true, i.e. never in a release build.
 */
export async function dropAllSchemaObjects(db: SQLiteDatabase): Promise<void> {
  const rows = await db.getAllAsync<{ type: string; name: string }>(
    `SELECT type, name FROM sqlite_master
      WHERE type IN ('view', 'trigger', 'table') AND name NOT LIKE 'sqlite_%'`,
  );
  const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;
  const order = ["view", "trigger", "table"];
  rows.sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));

  // Foreign keys must be off to drop tables in any order; switched back on below.
  await db.execAsync("PRAGMA foreign_keys = OFF;");
  try {
    for (const { type, name } of rows) {
      await db.execAsync(
        `DROP ${type.toUpperCase()} IF EXISTS ${quote(name)};`,
      );
    }
    await db.execAsync("PRAGMA user_version = 0;");
  } finally {
    await db.execAsync("PRAGMA foreign_keys = ON;");
  }
}
