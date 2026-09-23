import {
  dailyReminderBody,
  formatTime,
  parseTime,
  toNotificationWeekday,
} from "../content";

const t = (key: string, options?: Record<string, unknown>) =>
  key === "notifications.dailyBody"
    ? "Log today's spending."
    : `Low: ${options?.accounts}.`;

describe("notification content", () => {
  it("parses and formats times", () => {
    expect(parseTime("20:30")).toEqual({ hour: 20, minute: 30 });
    expect(parseTime("7:05")).toEqual({ hour: 7, minute: 5 });
    expect(parseTime("bad")).toEqual({ hour: 20, minute: 0 });
    expect(formatTime(7, 5)).toBe("07:05");
  });

  it("converts Monday-first weekdays to Sunday-first", () => {
    expect(toNotificationWeekday(1)).toBe(2); // Monday
    expect(toNotificationWeekday(6)).toBe(7); // Saturday
    expect(toNotificationWeekday(7)).toBe(1); // Sunday
  });

  it("names low accounts in the daily reminder (FR-10.2)", () => {
    expect(dailyReminderBody([], t)).toBe("Log today's spending.");
    expect(dailyReminderBody(["Cash", "GoPay"], t)).toBe(
      "Log today's spending. Low: Cash, GoPay.",
    );
  });
});
