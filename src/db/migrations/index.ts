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

/** Every table and view the app needs. Checked after each start-up. */
const REQUIRED_OBJECTS = [
  "accounts",
  "categories",
  "recurring_rules",
  "entries",
  "transfers",
  "budgets",
  "goals",
  "goal_movements",
  "pending_entries",
  "settings",
  "budget_alert_state",
  "account_alert_state",
  "v_account_movements",
  "v_cashflow",
];

/** The database file is not in a state any migration can safely continue from. */
export class SchemaStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SchemaStateError";
  }
}

export async function getSchemaVersion(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number }>(
    "PRAGMA user_version;",
  );
  return row?.user_version ?? 0;
}

async function listSchemaObjects(db: SQLiteDatabase): Promise<string[]> {
  const rows = await db.getAllAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%'",
  );
  return rows.map((r) => r.name);
}

async function migrate(db: SQLiteDatabase): Promise<number> {
  const current = await getSchemaVersion(db);

  if (current > LATEST_SCHEMA_VERSION) {
    throw new SchemaStateError(
      `Database schema v${current} is newer than this app (v${LATEST_SCHEMA_VERSION}). ` +
        "Install the latest version of the app.",
    );
  }

  if (current === 0 && (await listSchemaObjects(db)).length > 0) {
    throw new SchemaStateError(
      "The database has tables but no schema version, so an earlier start-up " +
        "stopped part-way through setting it up.",
    );
  }

  for (let version = current + 1; version <= LATEST_SCHEMA_VERSION; version++) {
    await db.withTransactionAsync(async () => {
      // Re-check inside the transaction, in case this version was applied meanwhile.
      if ((await getSchemaVersion(db)) >= version) return;
      await MIGRATIONS[version - 1](db);
      await db.execAsync(`PRAGMA user_version = ${version};`);
    });
  }

  const present = new Set(await listSchemaObjects(db));
  const missing = REQUIRED_OBJECTS.filter((name) => !present.has(name));
  if (missing.length > 0) {
    throw new SchemaStateError(
      `The database is missing: ${missing.join(", ")}.`,
    );
  }

  return LATEST_SCHEMA_VERSION;
}

const inFlight = new WeakMap<SQLiteDatabase, Promise<number>>();

/**
 * Bring the database up to LATEST_SCHEMA_VERSION and confirm every table and
 * view exists. Concurrent calls for the same database share one run, so two
 * overlapping start-ups can never apply a migration twice. Each migration and
 * its version bump run in one transaction, so a failure leaves the database
 * exactly as it was.
 */
export function runMigrations(db: SQLiteDatabase): Promise<number> {
  const running = inFlight.get(db);
  if (running) return running;

  const run = migrate(db).finally(() => inFlight.delete(db));
  inFlight.set(db, run);
  return run;
}
