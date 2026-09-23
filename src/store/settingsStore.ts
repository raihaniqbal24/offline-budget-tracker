import { create } from "zustand";
import { getDb } from "../db/client";
import { getSetting, setSetting } from "../db/settingsDao";
import { applyLanguage } from "../i18n";
import {
  notificationsAvailable,
  requestNotificationPermission,
} from "../notifications";
import { syncReminders } from "../notifications/service";
import type { LanguageSetting, SettingKey, SettingsMap } from "../types";
import { useLedgerStore } from "./ledgerStore";

export interface NotificationSettings {
  dailyReminderEnabled: boolean;
  dailyReminderTime: string; // "HH:mm"
  backupReminderEnabled: boolean;
  backupReminderWeekday: number; // 1 = Monday ... 7 = Sunday
  backupReminderTime: string;
  alertsEnabled: boolean;
}

type NotificationSettingKey =
  | "daily_reminder_enabled"
  | "backup_reminder_enabled"
  | "alerts_enabled";

interface SettingsState extends NotificationSettings {
  language: LanguageSetting;
  schemaVersion: number;
  lastBackupAt: string | null;
  /** The user said no to notifications; in-app flags still work (FR-10.6). */
  permissionDenied: boolean;

  hydrate: (values: {
    language: LanguageSetting;
    schemaVersion: number;
  }) => void;
  /** Re-read every setting from the database, e.g. after a restore. */
  reload: () => Promise<void>;
  setLanguage: (language: LanguageSetting) => Promise<void>;
  /** Turn a notification feature on or off. Asks for permission when turning on. */
  setNotificationEnabled: (
    key: NotificationSettingKey,
    enabled: boolean,
  ) => Promise<boolean>;
  setReminderSchedule: (
    changes: Partial<
      Pick<
        NotificationSettings,
        "dailyReminderTime" | "backupReminderWeekday" | "backupReminderTime"
      >
    >,
  ) => Promise<void>;
  markBackupDone: () => Promise<void>;
}

const FIELD: Record<NotificationSettingKey, keyof NotificationSettings> = {
  daily_reminder_enabled: "dailyReminderEnabled",
  backup_reminder_enabled: "backupReminderEnabled",
  alerts_enabled: "alertsEnabled",
};

async function read<K extends SettingKey>(
  key: K,
  fallback: SettingsMap[K],
): Promise<SettingsMap[K]> {
  return (await getSetting(await getDb(), key)) ?? fallback;
}

async function resync() {
  await syncReminders(await getDb(), useLedgerStore.getState().accounts, true);
}

export const useSettingsStore = create<SettingsState>()((set) => ({
  language: "system",
  schemaVersion: 0,
  lastBackupAt: null,
  permissionDenied: false,
  dailyReminderEnabled: false,
  dailyReminderTime: "20:00",
  backupReminderEnabled: false,
  backupReminderWeekday: 7,
  backupReminderTime: "19:00",
  alertsEnabled: false,

  hydrate: (values) => {
    set(values);
    void useSettingsStore.getState().reload();
  },

  reload: async () => {
    set({
      language: await read("language", "system"),
      lastBackupAt: await read("last_backup_at", null),
      dailyReminderEnabled: await read("daily_reminder_enabled", false),
      dailyReminderTime: await read("daily_reminder_time", "20:00"),
      backupReminderEnabled: await read("backup_reminder_enabled", false),
      backupReminderWeekday: await read("backup_reminder_weekday", 7),
      backupReminderTime: await read("backup_reminder_time", "19:00"),
      alertsEnabled: await read("alerts_enabled", false),
    });
  },

  setLanguage: async (language) => {
    const db = await getDb();
    await setSetting(db, "language", language);
    await applyLanguage(language);
    set({ language });
    await resync(); // reminder text follows the language
  },

  setNotificationEnabled: async (key, enabled) => {
    const db = await getDb();
    if (enabled) {
      if (!notificationsAvailable) return false; // Expo Go: nothing to schedule
      await setSetting(db, "notification_permission_asked", true);
      const allowed = await requestNotificationPermission();
      if (!allowed) {
        set({ permissionDenied: true });
        return false;
      }
      set({ permissionDenied: false });
    }
    await setSetting(db, key, enabled);
    set({ [FIELD[key]]: enabled } as Partial<SettingsState>);
    await resync();
    return true;
  },

  setReminderSchedule: async (changes) => {
    const db = await getDb();
    if (changes.dailyReminderTime !== undefined)
      await setSetting(db, "daily_reminder_time", changes.dailyReminderTime);
    if (changes.backupReminderWeekday !== undefined)
      await setSetting(
        db,
        "backup_reminder_weekday",
        changes.backupReminderWeekday,
      );
    if (changes.backupReminderTime !== undefined)
      await setSetting(db, "backup_reminder_time", changes.backupReminderTime);
    set(changes);
    await resync();
  },

  markBackupDone: async () => {
    const now = new Date().toISOString();
    await setSetting(await getDb(), "last_backup_at", now);
    set({ lastBackupAt: now });
  },
}));
