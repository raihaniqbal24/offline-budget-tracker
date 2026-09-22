import { getDb } from "./db/client";
import { runMigrations } from "./db/migrations";
import { getSetting } from "./db/settingsDao";
import { initI18n } from "./i18n";
import { useLedgerStore } from "./store/ledgerStore";
import { useSettingsStore } from "./store/settingsStore";

/**
 * Everything that must happen before the first screen renders:
 * open the database, migrate it, load the saved language, then load
 * accounts (with balances) and categories.
 * Later phases add: recurring-entry generation (phase 5) and budget and
 * balance alert checks on app open (phases 3 and 4).
 */
export async function bootstrap(): Promise<void> {
  const db = await getDb();
  const schemaVersion = await runMigrations(db);
  const language = (await getSetting(db, "language")) ?? "system";

  await initI18n(language);
  useSettingsStore.getState().hydrate({ language, schemaVersion });
  await useLedgerStore.getState().load();
}
