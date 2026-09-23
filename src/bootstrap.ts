import { getDb } from "./db/client";
import { dropAllSchemaObjects } from "./db/devReset";
import { runMigrations } from "./db/migrations";
import { getSetting } from "./db/settingsDao";
import { initI18n } from "./i18n";
import { configureNotifications } from "./notifications";
import { useLedgerStore } from "./store/ledgerStore";
import { useSettingsStore } from "./store/settingsStore";

let startup: Promise<void> | null = null;

/**
 * Everything that must happen before the first screen renders:
 * open the database, migrate it, load the saved language, then load
 * accounts (with balances) and categories.
 *
 * Calls made while a start-up is running share it, so React running the
 * start-up effect twice in development can't migrate the database twice.
 * Loading the ledger also checks budget and balance alerts and schedules
 * reminders. Phase 5 adds recurring-entry generation here.
 */
export function bootstrap(): Promise<void> {
  if (!startup) {
    startup = run().catch((error) => {
      startup = null; // allow a retry
      throw error;
    });
  }
  return startup;
}

async function run(): Promise<void> {
  const db = await getDb();
  const schemaVersion = await runMigrations(db);
  const language = (await getSetting(db, "language")) ?? "system";

  await initI18n(language);
  await configureNotifications(); // channel names are translated
  useSettingsStore.getState().hydrate({ language, schemaVersion });
  await useLedgerStore.getState().load();
}

/** DEVELOPMENT ONLY: wipe the local database so the next start-up rebuilds it. */
export async function resetLocalDatabaseForDevelopment(): Promise<void> {
  if (!__DEV__)
    throw new Error("Database reset is only available in development builds.");
  startup = null;
  await dropAllSchemaObjects(await getDb());
}
