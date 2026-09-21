import {
  addDays,
  addMonths,
  canGoToNextPeriod,
  daysForAverage,
  diffDays,
  eachDay,
  eachMonthOfYear,
  getPeriodRange,
  isCurrentPeriod,
  isValidISODate,
  isoWeekday,
  occurrenceDate,
  occurrencesBetween,
  shiftPeriod,
  startOfWeek,
  toISODate,
  today,
  yesterday,
} from "../dates";

describe("local dates", () => {
  it("uses the local calendar day, not UTC", () => {
    // 00:30 local on 1 March: the UTC date could be the previous day.
    const now = new Date(2026, 2, 1, 0, 30);
    expect(today(now)).toBe("2026-03-01");
    expect(yesterday(now)).toBe("2026-02-28");
    expect(toISODate(new Date(2026, 11, 31, 23, 59))).toBe("2026-12-31");
  });

  it("validates dates", () => {
    expect(isValidISODate("2024-02-29")).toBe(true);
    expect(isValidISODate("2026-02-29")).toBe(false);
    expect(isValidISODate("2026-13-01")).toBe(false);
    expect(isValidISODate("2026-1-01")).toBe(false);
  });

  it("adds days across month and year ends", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(diffDays("2026-01-01", "2026-12-31")).toBe(364);
  });

  it("clamps months to the last day", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2024-01-31", 1)).toBe("2024-02-29");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
    expect(addMonths("2026-01-15", -1)).toBe("2025-12-15");
  });
});

describe("periods", () => {
  it("starts weeks on Monday", () => {
    expect(isoWeekday("2026-09-21")).toBe(1); // Monday
    expect(isoWeekday("2026-09-27")).toBe(7); // Sunday
    expect(startOfWeek("2026-09-27")).toBe("2026-09-21");
    expect(startOfWeek("2026-09-21")).toBe("2026-09-21");
    expect(getPeriodRange("week", "2026-09-24")).toEqual({
      start: "2026-09-21",
      end: "2026-09-27",
    });
  });

  it("uses calendar months and years", () => {
    expect(getPeriodRange("month", "2026-02-10")).toEqual({
      start: "2026-02-01",
      end: "2026-02-28",
    });
    expect(getPeriodRange("year", "2026-06-01")).toEqual({
      start: "2026-01-01",
      end: "2026-12-31",
    });
  });

  it("moves between periods", () => {
    expect(shiftPeriod("day", "2026-03-01", -1)).toBe("2026-02-28");
    expect(shiftPeriod("week", "2026-09-24", -1)).toBe("2026-09-14");
    expect(shiftPeriod("month", "2026-03-31", -1)).toBe("2026-02-01");
    expect(shiftPeriod("year", "2026-06-15", 1)).toBe("2027-01-01");
  });

  it("stops the next arrow at the current period", () => {
    const now = "2026-09-21";
    expect(isCurrentPeriod("month", "2026-09-01", now)).toBe(true);
    expect(canGoToNextPeriod("month", "2026-09-01", now)).toBe(false);
    expect(canGoToNextPeriod("month", "2026-08-01", now)).toBe(true);
    expect(canGoToNextPeriod("day", now, now)).toBe(false);
  });

  it("averages over elapsed days in the current period", () => {
    const month = getPeriodRange("month", "2026-09-01");
    expect(daysForAverage(month, "2026-09-21")).toBe(21);
    expect(
      daysForAverage(getPeriodRange("month", "2026-08-01"), "2026-09-21"),
    ).toBe(31);
  });

  it("lists days and months for charts", () => {
    expect(eachDay(getPeriodRange("week", "2026-09-21"))).toHaveLength(7);
    expect(eachDay(getPeriodRange("month", "2026-02-01"))).toHaveLength(28);
    expect(eachMonthOfYear(2026)[11]).toBe("2026-12");
  });
});

describe("recurring occurrences", () => {
  it("keeps the 31st after short months", () => {
    expect(occurrenceDate("2026-01-31", "monthly", 1)).toBe("2026-02-28");
    expect(occurrenceDate("2026-01-31", "monthly", 2)).toBe("2026-03-31");
    expect(occurrenceDate("2026-01-31", "monthly", 3)).toBe("2026-04-30");
  });

  it("handles 29 February yearly", () => {
    expect(occurrenceDate("2024-02-29", "yearly", 1)).toBe("2025-02-28");
    expect(occurrenceDate("2024-02-29", "yearly", 4)).toBe("2028-02-29");
  });

  it("lists missed occurrences once, after the last generated one", () => {
    expect(
      occurrencesBetween("2026-06-15", "monthly", "2026-09-21", {
        after: "2026-07-15",
      }),
    ).toEqual(["2026-08-15", "2026-09-15"]);
  });

  it("respects the end date", () => {
    expect(
      occurrencesBetween("2026-09-01", "weekly", "2026-12-31", {
        end: "2026-09-20",
      }),
    ).toEqual(["2026-09-01", "2026-09-08", "2026-09-15"]);
  });

  it("returns nothing before the start date", () => {
    expect(occurrencesBetween("2026-10-01", "daily", "2026-09-21")).toEqual([]);
  });
});
