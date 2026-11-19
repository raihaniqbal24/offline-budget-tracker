import { groupByDay } from "../daySections";

type Row = { date: string; amount: number | null };
const dateOf = (r: Row) => r.date;
const signedOf = (r: Row) => r.amount;

describe("groupByDay", () => {
  const rows: Row[] = [
    { date: "2026-09-21", amount: -25000 },
    { date: "2026-09-21", amount: 100000 },
    { date: "2026-09-21", amount: -5000 },
    { date: "2026-09-20", amount: null }, // a transfer
    { date: "2026-09-19", amount: 3000 },
  ];

  it("groups adjacent rows by day and totals spending and income apart", () => {
    const days = groupByDay(rows, dateOf, signedOf, false);
    expect(days.map((d) => [d.date, d.data.length])).toEqual([
      ["2026-09-21", 3],
      ["2026-09-20", 1],
      ["2026-09-19", 1],
    ]);
    expect(days[0]).toMatchObject({ spending: 30000, income: 100000 });
    expect(days[1]).toMatchObject({ spending: 0, income: 0 });
    expect(days[2]).toMatchObject({ spending: 0, income: 3000 });
    expect(days.every((d) => d.complete)).toBe(true);
  });

  it("marks only the last day incomplete while more pages remain", () => {
    const days = groupByDay(rows, dateOf, signedOf, true);
    expect(days.map((d) => d.complete)).toEqual([true, true, false]);
  });

  it("returns nothing for an empty list", () => {
    expect(groupByDay([], dateOf, signedOf, true)).toEqual([]);
  });
});
