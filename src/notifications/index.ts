/**
 * Local notifications only (FR-10.7): nothing is pushed from a server.
 * Every call is wrapped so a notification problem can never stop an entry
 * from saving; in-app flags keep working either way (FR-10.6).
 */
import Constants, { ExecutionEnvironment } from "expo-constants";
import type * as NotificationsModule from "expo-notifications";
import i18n from "../i18n";

/**
 * Expo Go can't do notifications on Android: since SDK 55 the library throws
 * as soon as it loads there, because push notifications were removed from
 * Expo Go. This app only uses local notifications, but the library is the
 * same one, so in Expo Go we never load it and the rest of the app runs
 * normally. A development build has it, and everything works.
 */
export const notificationsAvailable =
  Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

let loaded: typeof NotificationsModule | null = null;

function notifications(): typeof NotificationsModule | null {
  if (!notificationsAvailable) return null;
  if (!loaded) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      loaded = require("expo-notifications") as typeof NotificationsModule;
    } catch (error) {
      if (__DEV__) console.warn("expo-notifications is unavailable:", error);
      return null;
    }
  }
  return loaded;
}

export const REMINDER_CHANNEL = "reminders";
export const ALERT_CHANNEL = "alerts";
export const DAILY_REMINDER_ID = "daily-reminder";
export const BACKUP_REMINDER_ID = "backup-reminder";

async function safely<T>(task: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await task();
  } catch (error) {
    if (__DEV__) console.warn("Notification call failed:", error);
    return fallback;
  }
}

/** Show notifications while the app is open too, and create the Android channels. */
export async function configureNotifications(): Promise<void> {
  const Notifications = notifications();
  if (!Notifications) return;
  await safely(async () => {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
    await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL, {
      name: i18n.t("notifications.channelReminders"),
      importance: Notifications.AndroidImportance.DEFAULT,
    });
    await Notifications.setNotificationChannelAsync(ALERT_CHANNEL, {
      name: i18n.t("notifications.channelAlerts"),
      importance: Notifications.AndroidImportance.HIGH,
    });
  }, undefined);
}

export async function hasNotificationPermission(): Promise<boolean> {
  const Notifications = notifications();
  if (!Notifications) return false;
  return safely(
    async () => (await Notifications.getPermissionsAsync()).granted === true,
    false,
  );
}

/**
 * FR-10.6: ask only when the user turns on a notification feature. Returns
 * whether notifications are allowed; false if the user said no before and
 * Android won't show the prompt again.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  const Notifications = notifications();
  if (!Notifications) return false;
  return safely(async () => {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    return (await Notifications.requestPermissionsAsync()).granted === true;
  }, false);
}

/** Repeats every day at hour:minute. Approximate timing: no exact alarms (NFR-12). */
export async function scheduleDaily(
  id: string,
  title: string,
  body: string,
  hour: number,
  minute: number,
) {
  const Notifications = notifications();
  if (!Notifications) return;
  await safely(async () => {
    await Notifications.cancelScheduledNotificationAsync(id);
    await Notifications.scheduleNotificationAsync({
      identifier: id,
      content: { title, body },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
        channelId: REMINDER_CHANNEL,
      },
    });
  }, undefined);
}

/** Repeats every week; `weekday` is Sunday-first (1 = Sunday), as the library expects. */
export async function scheduleWeekly(
  id: string,
  title: string,
  body: string,
  weekday: number,
  hour: number,
  minute: number,
) {
  const Notifications = notifications();
  if (!Notifications) return;
  await safely(async () => {
    await Notifications.cancelScheduledNotificationAsync(id);
    await Notifications.scheduleNotificationAsync({
      identifier: id,
      content: { title, body },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday,
        hour,
        minute,
        channelId: REMINDER_CHANNEL,
      },
    });
  }, undefined);
}

export async function cancelScheduled(id: string) {
  const Notifications = notifications();
  if (!Notifications) return;
  await safely(
    () => Notifications.cancelScheduledNotificationAsync(id),
    undefined,
  );
}

/** Show an alert now, on the alerts channel. */
export async function notifyNow(title: string, body: string) {
  const Notifications = notifications();
  if (!Notifications) return;
  await safely(
    () =>
      Notifications.scheduleNotificationAsync({
        content: { title, body },
        trigger: { channelId: ALERT_CHANNEL },
      }),
    "",
  );
}
