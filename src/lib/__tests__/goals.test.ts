import { goalProgress, monthsBetween } from "../goals";

const TODAY = "2026-09-21";

describe("goal progress (FR-12.6)", () => {
  it("counts whole months", () => {
    expect(monthsBetween("2026-09-21", "2026-12-01")).toBe(3);
    expect(monthsBetween("2026-09-30", "2026-09-01")).toBe(0);
    expect(monthsBetween("2026-09-21", "2027-03-15")).toBe(6);
  });

  it("reports saved, remaining and percent", () => {
    expect(goalProgress(2_500_000, 10_000_000, null, TODAY)).toMatchObject({
      remaining: 7_500_000,
      percent: 25,
      monthsLeft: null,
      monthlyNeeded: null,
      overdue: false,
    });
  });

  it("caps a goal that is over target", () => {
    expect(goalProgress(12_000_000, 10_000_000, null, TODAY)).toMatchObject({
      remaining: 0,
      percent: 100,
    });
  });

  it("works out the monthly amount needed, counting the target month", () => {
    // 7.5jt to go, target in December: September, October, November, December = 4 months
    expect(
      goalProgress(2_500_000, 10_000_000, "2026-12-31", TODAY),
    ).toMatchObject({
      monthsLeft: 4,
      monthlyNeeded: 1_875_000,
      overdue: false,
    });
    // A target this month leaves one month, not zero.
    expect(goalProgress(0, 1_000_000, "2026-09-30", TODAY).monthsLeft).toBe(1);
  });

  it("marks a missed target date, but not a reached goal", () => {
    expect(
      goalProgress(1_000_000, 10_000_000, "2026-08-31", TODAY).overdue,
    ).toBe(true);
    expect(
      goalProgress(10_000_000, 10_000_000, "2026-08-31", TODAY),
    ).toMatchObject({ overdue: false, monthlyNeeded: 0 });
  });
});
