import type { SQLiteDatabase } from "expo-sqlite";
import { createTestDb, describeDb } from "../../test/testDb";
import {
  createAccount,
  listAccountsWithBalances,
  setAccountArchived,
} from "../../db/accountsDao";
import { listCategories } from "../../db/categoriesDao";
import { createEntry, getPeriodTotals } from "../../db/entriesDao";
import { createTransfer } from "../../db/transfersDao";
import { setBudgetLimit } from "../../db/budgetsDao";
import { createGoal, addMovement, getTotalInGoals } from "../../db/goalsDao";
import { getPeriodRange } from "../../lib/dates";
import { buildSummary } from "../update";
import { widgetView } from "../summary";

const TODAY = "2026-09-21";
const opts = {
  masked: false,
  language: "en" as const,
  theme: "light" as const,
};

describeDb("widget figures match the app (FR-14.1, FR-14.2)", () => {
  let db: SQLiteDatabase;
  let cash: number;
  let bca: number;
  let food: number;

  beforeEach(async () => {
    db = await createTestDb();
    cash = await createAccount(db, {
      name: "Cash",
      type: "cash",
      openingBalance: 2_000_000,
      alertLine: null,
    });
    bca = await createAccount(db, {
      name: "BCA",
      type: "bank",
      openingBalance: 9_000_000,
      alertLine: null,
    });
    food = (await listCategories(db)).find(
      (c) => c.i18nKey === "category.starter.food",
    )!.id;
  });

  const appTotal = async () =>
    (await listAccountsWithBalances(db, TODAY))
      .filter((a) => !a.archived)
      .reduce((s, a) => s + a.balance, 0);

  it("reports the same balance and month spending as the app's own screens", async () => {
    await createEntry(db, {
      type: "expense",
      amount: 750_000,
      accountId: cash,
      categoryId: food,
      occurredOn: "2026-09-05",
      note: null,
    });
    await createTransfer(db, {
      fromAccountId: bca,
      toAccountId: cash,
      amount: 500_000,
      fee: 6_500,
      feePaidBy: "sender",
      occurredOn: "2026-09-10",
      note: null,
    });
    await setBudgetLimit(
      db,
      { scope: "overall", categoryId: null, accountId: null },
      2_000_000,
      "2026-09",
    );

    const summary = await buildSummary(db, TODAY, opts);
    const monthTotals = await getPeriodTotals(
      db,
      getPeriodRange("month", TODAY),
      TODAY,
    );
    expect(summary.balance).toBe(await appTotal());
    expect(summary.spent).toBe(monthTotals.spending); // fees included, like the app
    expect(summary.limit).toBe(2_000_000);
    expect(widgetView(summary, TODAY).percent).toBe(37);
  });

  it("leaves money saved in goals out of the balance (FR-14.2)", async () => {
    const goal = await createGoal(db, {
      name: "Umrah",
      targetAmount: 30_000_000,
      targetDate: null,
      measure: "manual",
      linkedAccountId: null,
    });
    await addMovement(
      db,
      {
        goalId: goal,
        accountId: cash,
        direction: "contribution",
        amount: 1_000_000,
        occurredOn: TODAY,
        note: null,
      },
      TODAY,
    );

    const summary = await buildSummary(db, TODAY, opts);
    expect(summary.balance).toBe(10_000_000); // 11,000,000 less the 1,000,000 now in the goal
    expect(await getTotalInGoals(db, TODAY)).toBe(1_000_000);
    expect(summary.balance).toBe(await appTotal());
  });

  it("ignores archived accounts and future-dated entries, exactly as the app does", async () => {
    await createEntry(db, {
      type: "expense",
      amount: 999_999,
      accountId: cash,
      categoryId: food,
      occurredOn: "2026-09-30",
      note: null,
    });
    await setAccountArchived(db, bca, true);

    const summary = await buildSummary(db, TODAY, opts);
    expect(summary.balance).toBe(2_000_000);
    expect(summary.spent).toBe(0);
  });

  it("still reports month spending when no overall limit is set (FR-14.3)", async () => {
    await createEntry(db, {
      type: "expense",
      amount: 120_000,
      accountId: cash,
      categoryId: food,
      occurredOn: TODAY,
      note: null,
    });
    const summary = await buildSummary(db, TODAY, opts);
    expect(summary).toMatchObject({
      limit: null,
      spent: 120_000,
      month: "2026-09",
    });
    expect(widgetView(summary, TODAY).noLimitText).toBe("No overall limit set");
  });

  it("carries the masked flag and the language through (FR-14.4, FR-14.7)", async () => {
    const summary = await buildSummary(db, TODAY, {
      masked: true,
      language: "id",
      theme: "dark",
    });
    expect(widgetView(summary, TODAY)).toMatchObject({
      balanceText: "••••••",
      balanceLabel: "Tersedia di akun",
    });
  });
});
