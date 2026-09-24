import type { SQLiteDatabase } from "expo-sqlite";
import { createTestDb, describeDb } from "../../test/testDb";
import { createAccount, listAccountsWithBalances } from "../accountsDao";
import { listCategories } from "../categoriesDao";
import { createEntry, getPeriodTotals, listEntries } from "../entriesDao";
import { createTransfer } from "../transfersDao";
import { getBudgetProgress, setBudgetLimit } from "../budgetsDao";
import { getCategoryBreakdown, getSpendingTrend } from "../summariesDao";
import { searchRecords, summarizeSearch, EMPTY_FILTERS } from "../searchDao";
import { getPeriodRange, type PeriodType } from "../../lib/dates";

/**
 * NFR-1: any period summary within 1 second with 10,000 entries.
 * NFR-2: a saved entry visible in the list and in balances within 300 ms.
 *
 * These run against the same SQL the app uses. A development machine is
 * faster than a mid-range phone, so the thresholds here are deliberately a
 * fraction of the target: if a query needs 300 ms here, it will miss the
 * 1 second budget on a phone.
 */

const TODAY = "2026-09-21";
const ENTRY_COUNT = 10_000;
/** Generous for a laptop, strict enough to catch a query that scans everything. */
const SUMMARY_BUDGET_MS = 300;
const SAVE_BUDGET_MS = 150;

async function timed<T>(task: () => Promise<T>): Promise<[T, number]> {
  const started = Date.now();
  const result = await task();
  return [result, Date.now() - started];
}

describeDb("performance with 10,000 entries (NFR-1, NFR-2)", () => {
  let db: SQLiteDatabase;
  let accounts: number[];
  let expenseCategories: number[];
  const timings: Record<string, number> = {};

  beforeAll(async () => {
    db = await createTestDb();
    accounts = [
      await createAccount(db, {
        name: "Cash",
        type: "cash",
        openingBalance: 5_000_000,
        alertLine: 100_000,
      }),
      await createAccount(db, {
        name: "BCA",
        type: "bank",
        openingBalance: 25_000_000,
        alertLine: null,
      }),
      await createAccount(db, {
        name: "GoPay",
        type: "ewallet",
        openingBalance: 1_000_000,
        alertLine: 50_000,
      }),
    ];
    const categories = await listCategories(db);
    expenseCategories = categories
      .filter((c) => c.type === "expense" && !c.builtinKey)
      .map((c) => c.id);
    const incomeCategory = categories.find(
      (c) => c.i18nKey === "category.starter.salary",
    )!.id;

    // Three years of entries, spread over accounts, categories and dates.
    await db.withTransactionAsync(async () => {
      for (let i = 0; i < ENTRY_COUNT; i++) {
        const day = new Date(2023, 9, 1);
        day.setDate(day.getDate() + Math.floor((i / ENTRY_COUNT) * 1_085));
        const occurredOn = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
        const income = i % 40 === 0;
        await createEntry(db, {
          type: income ? "income" : "expense",
          amount: income ? 8_000_000 : 5_000 + ((i * 7_919) % 250_000),
          accountId: accounts[i % accounts.length],
          categoryId: income
            ? incomeCategory
            : expenseCategories[i % expenseCategories.length],
          occurredOn,
          note: i % 3 === 0 ? `Entry number ${i} warung kopi` : null,
        });
        if (i % 50 === 0) {
          await createTransfer(db, {
            fromAccountId: accounts[1],
            toAccountId: accounts[i % 2],
            amount: 200_000,
            fee: i % 100 === 0 ? 6_500 : 0,
            feePaidBy: "sender",
            occurredOn,
            note: null,
          });
        }
      }
    });
    await setBudgetLimit(
      db,
      { scope: "overall", categoryId: null, accountId: null },
      5_000_000,
      "2026-09",
    );
    await setBudgetLimit(
      db,
      { scope: "account", categoryId: null, accountId: accounts[0] },
      2_000_000,
      "2026-09",
    );
    for (const categoryId of expenseCategories) {
      await setBudgetLimit(
        db,
        { scope: "category", categoryId, accountId: null },
        1_000_000,
        "2026-09",
      );
    }
  }, 120_000);

  afterAll(() => {
    // Printed so a slow query is obvious in CI output.
    console.log("timings (ms):", JSON.stringify(timings));
  });

  it("holds the generated data", async () => {
    const [{ n }] = await db.getAllAsync<{ n: number }>(
      "SELECT COUNT(*) AS n FROM entries",
    );
    expect(n).toBe(ENTRY_COUNT);
  });

  it.each<PeriodType>(["day", "week", "month", "year"])(
    "builds the whole %s summary well inside the budget",
    async (type) => {
      const range = getPeriodRange(type, TODAY);
      const [, ms] = await timed(async () => {
        // Everything the summary screen asks for in one go.
        await Promise.all([
          getPeriodTotals(db, range, TODAY),
          getPeriodTotals(db, getPeriodRange(type, "2026-08-21"), TODAY),
          getCategoryBreakdown(db, range, TODAY),
          type === "day"
            ? listEntries(db, { limit: 500, range })
            : getSpendingTrend(
                db,
                range,
                TODAY,
                type === "year" ? "month" : "day",
              ),
          type === "month"
            ? getBudgetProgress(db, "2026-09", TODAY)
            : Promise.resolve([]),
        ]);
      });
      timings[`summary:${type}`] = ms;
      expect(ms).toBeLessThan(SUMMARY_BUDGET_MS);
    },
  );

  it("filters a summary to one account just as quickly", async () => {
    const range = getPeriodRange("month", TODAY);
    const [, ms] = await timed(() =>
      Promise.all([
        getPeriodTotals(db, range, TODAY, accounts[0]),
        getCategoryBreakdown(db, range, TODAY, accounts[0]),
        getSpendingTrend(db, range, TODAY, "day", accounts[0]),
      ]),
    );
    timings["summary:month+account"] = ms;
    expect(ms).toBeLessThan(SUMMARY_BUDGET_MS);
  });

  it("saves an entry and refreshes balances and the list within the budget (NFR-2)", async () => {
    const [, ms] = await timed(async () => {
      await createEntry(db, {
        type: "expense",
        amount: 25_000,
        accountId: accounts[0],
        categoryId: expenseCategories[0],
        occurredOn: TODAY,
        note: "Kopi",
      });
      // What the app does straight after a save.
      await listAccountsWithBalances(db, TODAY);
      await listEntries(db, { limit: 100 });
    });
    timings["save+refresh"] = ms;
    expect(ms).toBeLessThan(SAVE_BUDGET_MS);
  });

  it("opens the entry list and pages through it quickly", async () => {
    const [firstPage, firstMs] = await timed(() =>
      listEntries(db, { limit: 100 }),
    );
    const [, nextMs] = await timed(() =>
      listEntries(db, { limit: 100, offset: 5_000 }),
    );
    timings["list:first"] = firstMs;
    timings["list:page50"] = nextMs;
    expect(firstPage).toHaveLength(100);
    expect(firstMs).toBeLessThan(SAVE_BUDGET_MS);
    expect(nextMs).toBeLessThan(SUMMARY_BUDGET_MS);
  });

  it("searches by note text and filters without a full scan showing", async () => {
    const filters = {
      ...EMPTY_FILTERS,
      text: "warung",
      categoryIds: expenseCategories.slice(0, 2),
    };
    const [, ms] = await timed(() =>
      Promise.all([
        searchRecords(db, filters, { limit: 100, offset: 0 }),
        summarizeSearch(db, filters),
      ]),
    );
    timings["search"] = ms;
    expect(ms).toBeLessThan(SUMMARY_BUDGET_MS);
  });
});
