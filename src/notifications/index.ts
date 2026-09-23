/**
 * Local notifications only (FR-10.7): nothing is pushed from a server.
 * Every call is wrapped so a notification problem can never stop an entry
 * from saving; in-app flags keep working either way (FR-10.6).
 */
import * as Notifications from "expo-notifications";
import i18n from "../i18n";

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
  await safely(
    () => Notifications.cancelScheduledNotificationAsync(id),
    undefined,
  );
}

/** Show an alert now, on the alerts channel. */
export async function notifyNow(title: string, body: string) {
  await safely(
    () =>
      Notifications.scheduleNotificationAsync({
        content: { title, body },
        trigger: { channelId: ALERT_CHANNEL },
      }),
    "",
  );
}
