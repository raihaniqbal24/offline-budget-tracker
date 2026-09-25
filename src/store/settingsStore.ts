import { create } from "zustand";
import { getDb } from "../db/client";
import { getSetting, setSetting } from "../db/settingsDao";
import { applyLanguage } from "../i18n";
import {
  notificationsAvailable,
  requestNotificationPermission,
} from "../notifications";
import { hasDeviceLock, setScreenProtection } from "../security/deviceLock";
import { updateWidget } from "../widget/update";
import { syncReminders } from "../notifications/service";
import type { ThemeSetting } from "../theme/ThemeProvider";
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
  /** FR-13.1 */
  appLockEnabled: boolean;
  /** FR-13.4: the switch needs a screen lock on the phone. */
  deviceLockAvailable: boolean;
  /** FR-15.1 */
  theme: ThemeSetting;

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
  /** Returns false when the phone has no screen lock to use. */
  setAppLock: (enabled: boolean) => Promise<boolean>;
  setTheme: (theme: ThemeSetting) => Promise<void>;
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
  appLockEnabled: false,
  deviceLockAvailable: false,
  theme: "system",
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
      appLockEnabled: await read("app_lock_enabled", false),
      theme: await read("theme", "system"),
      deviceLockAvailable: await hasDeviceLock(),
    });
    // FR-13.5: the recents preview, screenshots and recording follow the switch.
    await setScreenProtection(await read("app_lock_enabled", false));
  },

  setLanguage: async (language) => {
    const db = await getDb();
    await setSetting(db, "language", language);
    await applyLanguage(language);
    set({ language });
    await resync(); // reminder text follows the language
    await updateWidget(db, useSettingsStore.getState().appLockEnabled); // FR-14.7
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

  setAppLock: async (enabled) => {
    if (enabled && !(await hasDeviceLock())) {
      set({ deviceLockAvailable: false });
      return false;
    }
    const db = await getDb();
    await setSetting(db, "app_lock_enabled", enabled);
    await setScreenProtection(enabled);
    set({ appLockEnabled: enabled, deviceLockAvailable: true });
    // FR-14.4: the home screen must stop showing amounts straight away.
    await updateWidget(db, enabled);
    return true;
  },

  setTheme: async (theme) => {
    await setSetting(await getDb(), "theme", theme);
    set({ theme });
    // FR-15.6: the widget follows the same choice.
    await updateWidget(
      await getDb(),
      useSettingsStore.getState().appLockEnabled,
    );
  },

  markBackupDone: async () => {
    const now = new Date().toISOString();
    await setSetting(await getDb(), "last_backup_at", now);
    set({ lastBackupAt: now });
  },
}));
