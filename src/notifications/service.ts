/**
 * What to schedule and send, based on the saved settings. Reads settings
 * from the database each time, so it works the same from any screen.
 */
import type { SQLiteDatabase } from "expo-sqlite";
import type { BudgetAlert } from "../db/budgetsDao";
import { getSetting } from "../db/settingsDao";
import { categoryLabel } from "../i18n";
import i18n from "../i18n";
import { formatRupiah } from "../lib/money";
import { currentLanguage } from "../i18n";
import type { AccountWithBalance, Category } from "../types";
import { dailyReminderBody, parseTime, toNotificationWeekday } from "./content";
import {
  BACKUP_REMINDER_ID,
  cancelScheduled,
  DAILY_REMINDER_ID,
  hasNotificationPermission,
  notifyNow,
  scheduleDaily,
  scheduleWeekly,
} from "./index";

let lastDailySignature = "";

/**
 * Schedule or cancel the daily reminder (FR-10.1, FR-10.2) and the weekly
 * backup reminder (FR-9.7) to match the settings. Called on start-up, after
 * a settings change, and after every save, so the daily reminder always
 * names the accounts that are low right now.
 */
export async function syncReminders(
  db: SQLiteDatabase,
  accounts: AccountWithBalance[],
  force = false,
) {
  const allowed = await hasNotificationPermission();

  const dailyOn =
    allowed && (await getSetting(db, "daily_reminder_enabled")) === true;
  const dailyTime = parseTime(
    (await getSetting(db, "daily_reminder_time")) ?? "20:00",
  );
  const low = accounts
    .filter((a) => !a.archived && a.isBelowAlertLine)
    .map((a) => a.name);
  const body = dailyReminderBody(low, (k, o) => i18n.t(k, o));
  const signature = `${dailyOn}|${dailyTime.hour}:${dailyTime.minute}|${body}|${i18n.language}`;

  if (force || signature !== lastDailySignature) {
    lastDailySignature = signature;
    if (dailyOn) {
      await scheduleDaily(
        DAILY_REMINDER_ID,
        i18n.t("notifications.dailyTitle"),
        body,
        dailyTime.hour,
        dailyTime.minute,
      );
    } else {
      await cancelScheduled(DAILY_REMINDER_ID);
    }
  }

  if (!force) return; // the weekly reminder only changes with its settings
  const backupOn =
    allowed && (await getSetting(db, "backup_reminder_enabled")) === true;
  if (backupOn) {
    const weekday = (await getSetting(db, "backup_reminder_weekday")) ?? 7;
    const time = parseTime(
      (await getSetting(db, "backup_reminder_time")) ?? "19:00",
    );
    await scheduleWeekly(
      BACKUP_REMINDER_ID,
      i18n.t("notifications.backupTitle"),
      i18n.t("notifications.backupBody"),
      toNotificationWeekday(weekday),
      time.hour,
      time.minute,
    );
  } else {
    await cancelScheduled(BACKUP_REMINDER_ID);
  }
}

/**
 * FR-7.5 and FR-10.4: phone notifications for newly reached budget levels
 * and for accounts that just crossed their alert line, when alerts are on.
 */
export async function sendAlerts(
  db: SQLiteDatabase,
  budgetAlerts: BudgetAlert[],
  crossedAccounts: AccountWithBalance[],
  context: { accounts: AccountWithBalance[]; categories: Category[] },
) {
  if (budgetAlerts.length === 0 && crossedAccounts.length === 0) return;
  if ((await getSetting(db, "alerts_enabled")) !== true) return;
  if (!(await hasNotificationPermission())) return;
  const lang = currentLanguage();

  for (const alert of budgetAlerts) {
    const name =
      alert.scope === "overall"
        ? i18n.t("budgets.overall")
        : alert.scope === "account"
          ? (context.accounts.find((a) => a.id === alert.accountId)?.name ?? "")
          : (() => {
              const c = context.categories.find(
                (x) => x.id === alert.categoryId,
              );
              return c ? categoryLabel(c) : "";
            })();
    const values = {
      name,
      percent: alert.percent,
      spent: formatRupiah(alert.spent, lang),
      limit: formatRupiah(alert.limit, lang),
    };
    await notifyNow(
      i18n.t("notifications.budgetTitle"),
      alert.level === 100
        ? i18n.t("budgets.alertReached", values)
        : i18n.t("budgets.alertLevel", values),
    );
  }

  for (const account of crossedAccounts) {
    await notifyNow(
      i18n.t("notifications.balanceTitle"),
      i18n.t("notifications.balanceBody", {
        name: account.name,
        balance: formatRupiah(account.balance, lang),
        line: formatRupiah(account.alertLine ?? 0, lang),
      }),
    );
  }
}
