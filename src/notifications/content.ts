/** Pure helpers for notification timing and text (FR-9.7, FR-10.1, FR-10.2). */

/** "20:30" -> { hour: 20, minute: 30 }; falls back to 20:00 on bad input. */
export function parseTime(value: string): { hour: number; minute: number } {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!m) return { hour: 20, minute: 0 };
  const hour = Math.min(23, Number(m[1]));
  const minute = Math.min(59, Number(m[2]));
  return { hour, minute };
}

export function formatTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/**
 * The app stores weekdays Monday-first (1 = Monday ... 7 = Sunday).
 * The notification library counts Sunday-first (1 = Sunday ... 7 = Saturday).
 */
export function toNotificationWeekday(mondayFirst: number): number {
  return (mondayFirst % 7) + 1;
}

/**
 * FR-10.2: the daily reminder names accounts at or below their alert line,
 * as of the last time the app opened or an entry was saved.
 */
export function dailyReminderBody(
  lowAccountNames: string[],
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const base = t("notifications.dailyBody");
  if (lowAccountNames.length === 0) return base;
  return `${base} ${t("notifications.dailyLowAccounts", { accounts: lowAccountNames.join(", ") })}`;
}
