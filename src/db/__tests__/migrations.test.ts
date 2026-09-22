import type { SQLiteDatabase } from "expo-sqlite";
import { createTestDb, describeDb } from "../../test/testDb";
import {
  getSchemaVersion,
  LATEST_SCHEMA_VERSION,
  runMigrations,
  SchemaStateError,
} from "../migrations";
import { dropAllSchemaObjects } from "../devReset";

async function count(db: SQLiteDatabase, sql: string): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>(sql);
  return row?.n ?? 0;
}

describeDb("migrations", () => {
  it("shares one run between overlapping start-ups", async () => {
    const db = await createTestDb(); // already migrated once
    await dropAllSchemaObjects(db);

    const results = await Promise.all([
      runMigrations(db),
      runMigrations(db),
      runMigrations(db),
    ]);
    expect(results).toEqual([
      LATEST_SCHEMA_VERSION,
      LATEST_SCHEMA_VERSION,
      LATEST_SCHEMA_VERSION,
    ]);
    expect(await count(db, "SELECT COUNT(*) AS n FROM categories")).toBe(10);
  });

  it("is a no-op when already up to date", async () => {
    const db = await createTestDb();
    await runMigrations(db);
    await runMigrations(db);
    expect(await getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);
    expect(await count(db, "SELECT COUNT(*) AS n FROM categories")).toBe(10);
  });

  it("reports a half-built database instead of failing on a table name", async () => {
    const db = await createTestDb();
    await dropAllSchemaObjects(db);
    await db.execAsync("CREATE TABLE accounts (id INTEGER PRIMARY KEY);"); // left behind, no version

    await expect(runMigrations(db)).rejects.toBeInstanceOf(SchemaStateError);
  });

  it("reports missing tables even when the version says it is current", async () => {
    const db = await createTestDb();
    await db.execAsync(
      "PRAGMA foreign_keys = OFF; DROP TABLE budget_alert_state; DROP TABLE budgets;",
    );

    await expect(runMigrations(db)).rejects.toThrow(
      /missing: budgets, budget_alert_state/,
    );
  });

  it("recovers after a development reset", async () => {
    const db = await createTestDb();
    await dropAllSchemaObjects(db);
    await db.execAsync("CREATE TABLE accounts (id INTEGER PRIMARY KEY);");
    await expect(runMigrations(db)).rejects.toBeInstanceOf(SchemaStateError);

    await dropAllSchemaObjects(db);
    expect(await getSchemaVersion(db)).toBe(0);
    await expect(runMigrations(db)).resolves.toBe(LATEST_SCHEMA_VERSION);
    expect(
      await count(
        db,
        "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'trigger'",
      ),
    ).toBe(4);
  });
});
