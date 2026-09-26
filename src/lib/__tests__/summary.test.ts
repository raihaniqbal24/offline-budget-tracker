import { getPeriodRange } from "../dates";
import {
  averagePerDay,
  buildTrend,
  compareWithPrevious,
  periodLabel,
  shareOf,
} from "../summary";

const TODAY = "2026-09-21";

describe("summary helpers", () => {
  it("compares with the previous period", () => {
    expect(compareWithPrevious(1_150_000, 1_000_000)).toEqual({
      change: 150_000,
      percent: 15,
    });
    expect(compareWithPrevious(800_000, 1_000_000)).toEqual({
      change: -200_000,
      percent: -20,
    });
    expect(compareWithPrevious(500_000, 0)).toEqual({
      change: 500_000,
      percent: null,
    });
  });

  it("averages over elapsed days in the current period and full length otherwise", () => {
    expect(
      averagePerDay(2_100_000, getPeriodRange("month", TODAY), TODAY),
    ).toBe(100_000); // 21 days
    expect(
      averagePerDay(3_100_000, getPeriodRange("month", "2026-08-01"), TODAY),
    ).toBe(100_000); // 31 days
    expect(averagePerDay(0, getPeriodRange("week", TODAY), TODAY)).toBe(0);
  });

  it("builds one bar per day or per month with zeros filled in", () => {
    const week = buildTrend(
      "week",
      getPeriodRange("week", TODAY),
      new Map([["2026-09-23", 50_000]]),
    );
    expect(week).toHaveLength(7);
    expect(week[2]).toEqual({ key: "2026-09-23", value: 50_000 });
    expect(week[0].value).toBe(0);

    expect(
      buildTrend("month", getPeriodRange("month", "2026-02-10"), new Map()),
    ).toHaveLength(28);

    const year = buildTrend(
      "year",
      getPeriodRange("year", TODAY),
      new Map([["2026-03", 9]]),
    );
    expect(year).toHaveLength(12);
    expect(year[2]).toEqual({ key: "2026-03", value: 9 });

    expect(buildTrend("day", getPeriodRange("day", TODAY), new Map())).toEqual(
      [],
    );
  });

  it("labels each period", () => {
    expect(periodLabel("day", getPeriodRange("day", TODAY), TODAY, "en")).toBe(
      "Today",
    );
    expect(
      periodLabel("week", getPeriodRange("week", TODAY), TODAY, "en"),
    ).toBe("21 Sep – 27 Sep");
    expect(
      periodLabel("month", getPeriodRange("month", TODAY), TODAY, "id"),
    ).toBe("September 2026");
    expect(
      periodLabel("year", getPeriodRange("year", TODAY), TODAY, "en"),
    ).toBe("2026");
  });

  it("computes shares", () => {
    expect(shareOf(250, 1000)).toBe(25);
    expect(shareOf(1, 0)).toBe(0);
  });
});
