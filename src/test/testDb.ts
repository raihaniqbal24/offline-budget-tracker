/**
 * An in-memory SQLite database with the same methods the app uses from
 * expo-sqlite, backed by Node's built-in node:sqlite (Node 22.5 or later).
 * On older Node versions `sqliteAvailable` is false and DB tests are skipped.
 */
import type { SQLiteDatabase } from "expo-sqlite";
import { runMigrations } from "../db/migrations";

type NodeSqlite = { DatabaseSync: new (path: string) => any };

let nodeSqlite: NodeSqlite | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  nodeSqlite = require("node:sqlite") as NodeSqlite;
} catch {
  nodeSqlite = null;
}

export const sqliteAvailable = nodeSqlite !== null;

/** `describe` when node:sqlite is available, otherwise `describe.skip`. */
export const describeDb: jest.Describe = sqliteAvailable
  ? describe
  : describe.skip;

export async function createTestDb(): Promise<SQLiteDatabase> {
  if (!nodeSqlite)
    throw new Error("node:sqlite is not available; use Node 22.5 or later");
  const raw = new nodeSqlite.DatabaseSync(":memory:");
  raw.exec("PRAGMA foreign_keys = ON;");

  const db = {
    execAsync: async (sql: string) => {
      raw.exec(sql);
    },
    runAsync: async (sql: string, ...params: unknown[]) => {
      const r = raw.prepare(sql).run(...params);
      return {
        lastInsertRowId: Number(r.lastInsertRowid),
        changes: Number(r.changes),
      };
    },
    getFirstAsync: async (sql: string, ...params: unknown[]) =>
      raw.prepare(sql).get(...params) ?? null,
    getAllAsync: async (sql: string, ...params: unknown[]) =>
      raw.prepare(sql).all(...params),
    withTransactionAsync: async (task: () => Promise<void>) => {
      raw.exec("BEGIN");
      try {
        await task();
        raw.exec("COMMIT");
      } catch (error) {
        raw.exec("ROLLBACK");
        throw error;
      }
    },
  } as unknown as SQLiteDatabase;

  await runMigrations(db);
  return db;
}
