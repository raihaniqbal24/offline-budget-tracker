import type { SQLiteDatabase } from "expo-sqlite";
import type { SettingKey, SettingsMap } from "../types";

/** Settings are stored as text; these convert to and from typed values. */
const decoders: { [K in SettingKey]: (raw: string) => SettingsMap[K] } = {
  language: (v) => (v === "en" || v === "id" ? v : "system"),
  daily_reminder_enabled: (v) => v === "1",
  daily_reminder_time: (v) => v,
  backup_reminder_enabled: (v) => v === "1",
  backup_reminder_weekday: (v) => Number(v),
  backup_reminder_time: (v) => v,
  notification_permission_asked: (v) => v === "1",
  last_used_account_id: (v) => (v === "" ? null : Number(v)),
  alerts_enabled: (v) => v === "1",
  last_backup_at: (v) => (v === "" ? null : v),
  app_lock_enabled: (v) => v === "1",
};

function encode(value: unknown): string {
  if (typeof value === "boolean") return value ? "1" : "0";
  if (value === null || value === undefined) return "";
  return String(value);
}

export async function getSetting<K extends SettingKey>(
  db: SQLiteDatabase,
  key: K,
): Promise<SettingsMap[K] | null> {
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM settings WHERE key = ?",
    key,
  );
  return row ? decoders[key](row.value) : null;
}

export async function setSetting<K extends SettingKey>(
  db: SQLiteDatabase,
  key: K,
  value: SettingsMap[K],
): Promise<void> {
  await db.runAsync(
    "INSERT INTO settings (key, value) VALUES (?, ?) " +
      "ON CONFLICT (key) DO UPDATE SET value = excluded.value",
    key,
    encode(value),
  );
}
