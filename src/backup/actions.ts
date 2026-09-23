/** Export actions used by the Settings screen (FR-9.1, FR-9.2). */
import { getDb } from "../db/client";
import { listEntries } from "../db/entriesDao";
import { categoryLabel } from "../i18n";
import { today } from "../lib/dates";
import { useSettingsStore } from "../store/settingsStore";
import { exportBackup } from "./backupDao";
import { backupFileName, entriesToCsv } from "./csv";
import { saveToFolder, shareFile, type Mime } from "./files";

export type ExportKind = "backup" | "entries";
export type ExportTarget = "share" | "folder";

async function build(
  kind: ExportKind,
): Promise<{ name: string; content: string; mime: Mime }> {
  const db = await getDb();
  if (kind === "backup") {
    const backup = await exportBackup(db);
    return {
      name: backupFileName("backup", today()),
      content: JSON.stringify(backup, null, 2),
      mime: "application/json",
    };
  }
  const entries = await listEntries(db, { limit: 1_000_000_000 });
  const csv = entriesToCsv(entries, (e) =>
    categoryLabel({ name: e.categoryName, i18nKey: e.categoryI18nKey }),
  );
  return {
    name: backupFileName("entries", today()),
    content: csv,
    mime: "text/csv",
  };
}

/**
 * Create the file only because the user asked (NFR-4), then share it or
 * save it to a folder they pick. Returns false if they cancelled the folder
 * picker. A full backup records the export date for the Settings screen.
 */
export async function exportFile(
  kind: ExportKind,
  target: ExportTarget,
): Promise<boolean> {
  const { name, content, mime } = await build(kind);
  if (target === "share") {
    await shareFile(name, content, mime);
  } else if (!(await saveToFolder(name, content, mime))) {
    return false;
  }
  if (kind === "backup") await useSettingsStore.getState().markBackupDone();
  return true;
}
