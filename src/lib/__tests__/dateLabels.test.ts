import { formatDate, formatDayHeader, formatMonthYear, monthInitial, weekdayInitial } from "../dateLabels";

const TODAY = "2026-09-21"; // a Monday

describe("date labels", () => {
  it("names nearby days", () => {
    expect(formatDayHeader(TODAY, TODAY, "en")).toBe("Today");
    expect(formatDayHeader("2026-09-20", TODAY, "id")).toBe("Kemarin");
    expect(formatDayHeader("2026-09-22", TODAY, "en")).toBe("Tomorrow");
  });

  it("formats other days with weekday, adding the year only when it differs", () => {
    expect(formatDayHeader("2026-09-18", TODAY, "en")).toBe("Fri, 18 Sep");
    expect(formatDayHeader("2026-05-18", TODAY, "id")).toBe("Sen, 18 Mei");
    expect(formatDayHeader("2025-12-31", TODAY, "en")).toBe("Wed, 31 Dec 2025");
    expect(formatDate("2026-08-17", "id", { todayDate: TODAY })).toBe("17 Agu");
  });

  it("formats month and year", () => {
    expect(formatMonthYear("2026-09-01", "en")).toBe("September 2026");
    expect(formatMonthYear("2026-08-01", "id")).toBe("Agustus 2026");
  });

  it("gives chart axis initials", () => {
    expect(weekdayInitial("2026-09-21", "en")).toBe("M"); // Monday
    expect(weekdayInitial("2026-09-23", "id")).toBe("R"); // Rabu
    expect(monthInitial("2026-09", "en")).toBe("S");
  });
});
