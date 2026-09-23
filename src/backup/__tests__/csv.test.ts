import { backupFileName, csvCell, entriesToCsv } from "../csv";
import type { EntryWithDetails } from "../../db/entriesDao";

const base: EntryWithDetails = {
  id: 1,
  uid: "u1",
  type: "expense",
  amount: 25_000,
  currencyCode: "IDR",
  accountId: 1,
  categoryId: 1,
  occurredOn: "2026-09-02",
  note: null,
  recurringRuleId: null,
  createdAt: "2026-09-02T00:00:00.000Z",
  categoryName: "Food",
  categoryI18nKey: null,
  categoryIcon: "x",
  categoryColor: "#000",
  categoryBuiltinKey: null,
  accountName: "Cash",
};

describe("csv", () => {
  it("quotes commas, quotes and new lines", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(-25000)).toBe("-25000");
  });

  it("stops notes from running as spreadsheet formulas", () => {
    expect(csvCell("=HYPERLINK(1)", { text: true })).toBe("'=HYPERLINK(1)");
    expect(csvCell("+62 812", { text: true })).toBe("'+62 812");
    expect(csvCell("-5", { text: false })).toBe("-5"); // numbers keep their sign
  });

  it("writes one signed row per entry, oldest first, with a BOM", () => {
    const csv = entriesToCsv(
      [
        {
          ...base,
          id: 2,
          occurredOn: "2026-09-03",
          type: "income",
          amount: 8_000_000,
          note: "Gaji, September",
        },
        base,
        {
          ...base,
          id: 3,
          occurredOn: "2026-09-03",
          type: "adjustment",
          amount: -15_000,
        },
      ],
      (e) => (e.type === "adjustment" ? "Unrecorded" : e.categoryName),
    );
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv.split("\r\n")).toEqual([
      "\uFEFFdate,type,amount,currency,account,category,note",
      "2026-09-02,expense,-25000,IDR,Cash,Food,",
      '2026-09-03,income,8000000,IDR,Cash,Food,"Gaji, September"',
      "2026-09-03,adjustment,-15000,IDR,Cash,Unrecorded,",
      "",
    ]);
  });

  it("names files by date", () => {
    expect(backupFileName("backup", "2026-09-21")).toBe(
      "budget-tracker-backup-2026-09-21.json",
    );
    expect(backupFileName("entries", "2026-09-21")).toBe(
      "budget-tracker-entries-2026-09-21.csv",
    );
  });
});
