import {
  emptySummary,
  parseSummary,
  widgetView,
  type WidgetSummary,
} from "../summary";
import { filledSegments } from "../BalanceWidget";

const TODAY = "2026-09-21";

const base: WidgetSummary = {
  version: 1,
  language: "en",
  masked: false,
  month: "2026-09",
  updatedOn: TODAY,
  balance: 10_330_000,
  spent: 750_000,
  limit: 2_000_000,
};

describe("widget summary (FR-14)", () => {
  it("shows the balance and progress against the overall limit", () => {
    expect(widgetView(base, TODAY)).toMatchObject({
      balanceText: "Rp 10,330,000",
      spentText: "Rp 750,000 of Rp 2,000,000",
      percent: 37,
      noLimitText: null,
      asOfText: "as of 21 Sep",
    });
  });

  it("says when no overall limit is set, and hides the bar (FR-14.3)", () => {
    const view = widgetView({ ...base, limit: null }, TODAY);
    expect(view).toMatchObject({
      spentText: "Rp 750,000",
      percent: null,
      noLimitText: "No overall limit set",
    });
  });

  it("masks every amount and the bar while the app lock is on (FR-14.4)", () => {
    const view = widgetView({ ...base, masked: true }, TODAY);
    expect(view).toMatchObject({
      balanceText: "••••••",
      spentText: "•••••• of ••••••",
      percent: null,
      noLimitText: null,
    });
    expect(view.balanceLabel).toBe("Available in accounts"); // labels stay
  });

  it("marks the figure as last month's once the month rolls over", () => {
    const view = widgetView(base, "2026-10-02");
    expect(view.spentLabel).toBe("Spent this month (last month)");
    expect(view.asOfText).toBe("as of 21 Sep");
  });

  it("renders in Indonesian when that is the app's language (FR-14.7)", () => {
    const view = widgetView({ ...base, language: "id" }, TODAY);
    expect(view).toMatchObject({
      balanceLabel: "Tersedia di akun",
      spentText: "Rp 750.000 dari Rp 2.000.000",
      asOfText: "per 21 Sep",
    });
  });

  it("caps the bar when the limit is passed", () => {
    expect(widgetView({ ...base, spent: 3_000_000 }, TODAY).percent).toBe(100);
  });

  it("refuses a summary it cannot trust, and has something to show meanwhile", () => {
    expect(parseSummary(null)).toBeNull();
    expect(
      parseSummary({
        version: 99,
        balance: 1,
        spent: 1,
        month: "2026-09",
        updatedOn: TODAY,
      }),
    ).toBeNull();
    expect(parseSummary({ ...base, balance: "lots" })).toBeNull();
    expect(parseSummary(JSON.parse(JSON.stringify(base)))).toEqual(base);
    expect(widgetView(emptySummary("en", TODAY), TODAY).balanceText).toBe(
      "Rp 0",
    );
  });
});

describe("progress segments", () => {
  // The bar is ten fixed blocks, because widget layouts take no percentages.
  it("fills a block for every tenth, and never rounds a small amount away", () => {
    expect(filledSegments(0)).toBe(0);
    expect(filledSegments(1)).toBe(1); // spending something always shows
    expect(filledSegments(37)).toBe(4);
    expect(filledSegments(75)).toBe(8);
    expect(filledSegments(100)).toBe(10);
    expect(filledSegments(140)).toBe(10); // capped
  });
});