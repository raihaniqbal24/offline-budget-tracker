import type { SQLiteDatabase } from "expo-sqlite";
import { createTestDb, describeDb } from "../../test/testDb";
import { createAccount, listAccountsWithBalances, setAccountArchived } from "../accountsDao";
import { createCategory, listCategories, moveCategory, setCategoryArchived, updateCategory } from "../categoriesDao";
import { createEntry } from "../entriesDao";
import { createTransfer } from "../transfersDao";
import { reconcileAccount } from "../adjustmentsDao";
import { checkBudgetAlerts, getBudgetProgress, setBudgetLimit } from "../budgetsDao";
import { EMPTY_FILTERS, searchRecords, summarizeSearch, type SearchFilters } from "../searchDao";

const TODAY = "2026-09-21";

async function cat(db: SQLiteDatabase, key: string): Promise<number> {
  return (await listCategories(db)).find((c) => c.i18nKey === key)!.id;
}

describeDb("categories (FR-6)", () => {
  let db: SQLiteDatabase;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it("adds a category with a name unique within its type (FR-6.1)", async () => {
    const id = await createCategory(db, { name: "Coffee", type: "expense", icon: "coffee", color: "#6B4F3A" });
    expect(id).toBeGreaterThan(0);
    await expect(createCategory(db, { name: "coffee", type: "expense", icon: "x", color: "#000" })).rejects.toThrow("duplicate_name");
    await createCategory(db, { name: "Coffee", type: "income", icon: "x", color: "#000" }); // other type is fine
    await expect(createCategory(db, { name: "  ", type: "expense", icon: "x", color: "#000" })).rejects.toThrow("name_required");
  });

  it("renames and recolors; renaming a seeded category drops its translation (FR-6.2)", async () => {
    const food = await cat(db, "category.starter.food");
    await updateCategory(db, food, { name: "Makan", icon: "food", color: "#FF0000" }, true);
    const updated = (await listCategories(db)).find((c) => c.id === food)!;
    expect(updated).toMatchObject({ name: "Makan", icon: "food", color: "#FF0000", i18nKey: null });

    const bills = await cat(db, "category.starter.bills");
    await updateCategory(db, bills, { name: "Bills", icon: "cash", color: "#123456" }, false);
    expect((await listCategories(db)).find((c) => c.id === bills)!.i18nKey).toBe("category.starter.bills");
  });

  it("reorders within a type (FR-6.2)", async () => {
    const order = async () =>
      (await listCategories(db)).filter((c) => c.type === "expense" && !c.builtinKey).map((c) => c.i18nKey);
    const transport = await cat(db, "category.starter.transport");
    await moveCategory(db, transport, -1);
    expect((await order()).slice(0, 2)).toEqual(["category.starter.transport", "category.starter.food"]);
    await moveCategory(db, transport, -1); // already first: no change
    expect((await order())[0]).toBe("category.starter.transport");
  });

  it("archives instead of deleting, and never archives built-ins (FR-6.3, FR-6.4)", async () => {
    const food = await cat(db, "category.starter.food");
    await setCategoryArchived(db, food, true);
    expect((await listCategories(db)).find((c) => c.id === food)!.archived).toBe(true);

    const unrecorded = (await listCategories(db)).find((c) => c.builtinKey === "unrecorded")!.id;
    await expect(setCategoryArchived(db, unrecorded, true)).rejects.toThrow(/builtin_category_cannot_be_archived/);
  });
});

describeDb("budgets (FR-7) — phase 3 exit check", () => {
  let db: SQLiteDatabase;
  let cash: number;
  let bca: number;
  let food: number;
  let bills: number;

  beforeEach(async () => {
    db = await createTestDb();
    cash = await createAccount(db, { name: "Cash", type: "cash", openingBalance: 2_000_000, alertLine: null });
    bca = await createAccount(db, { name: "BCA", type: "bank", openingBalance: 5_000_000, alertLine: null });
    food = await cat(db, "category.starter.food");
    bills = await cat(db, "category.starter.bills");
  });

  const progressFor = async (month = "2026-09", today = TODAY) =>
    Object.fromEntries(
      (await getBudgetProgress(db, month, today)).map((p) => [`${p.scope}:${p.categoryId ?? p.accountId ?? ""}`, p])
    );

  it("counts each scope correctly, including fees and unrecorded spending (FR-7.3)", async () => {
    await setBudgetLimit(db, { scope: "category", categoryId: food, accountId: null }, 1_000_000, "2026-09");
    await setBudgetLimit(db, { scope: "account", categoryId: null, accountId: cash }, 500_000, "2026-09");
    await setBudgetLimit(db, { scope: "overall", categoryId: null, accountId: null }, 2_000_000, "2026-09");

    await createEntry(db, { type: "expense", amount: 300_000, accountId: cash, categoryId: food, occurredOn: "2026-09-05", note: null });
    await createEntry(db, { type: "expense", amount: 450_000, accountId: bca, categoryId: food, occurredOn: "2026-09-10", note: null });
    await createEntry(db, { type: "expense", amount: 200_000, accountId: bca, categoryId: bills, occurredOn: "2026-09-12", note: null });
    await createTransfer(db, { fromAccountId: cash, toAccountId: bca, amount: 100_000, fee: 6_500, feePaidBy: "sender", occurredOn: "2026-09-15", note: null });
    await reconcileAccount(db, cash, 1_500_000, TODAY); // cash balance was 1,593,500 -> 93,500 unrecorded
    await createEntry(db, { type: "expense", amount: 999_999, accountId: cash, categoryId: food, occurredOn: "2026-09-30", note: null }); // future
    await createEntry(db, { type: "expense", amount: 88_000, accountId: cash, categoryId: food, occurredOn: "2026-08-31", note: null }); // last month

    const p = await progressFor();
    expect(p[`category:${food}`]).toMatchObject({ spent: 750_000, limit: 1_000_000, percent: 75 });
    expect(p[`account:${cash}`]).toMatchObject({ spent: 300_000 + 6_500 + 93_500, percent: 80 });
    expect(p["overall:"]).toMatchObject({ spent: 300_000 + 450_000 + 200_000 + 6_500 + 93_500, percent: 52 });
  });

  it("repeats a limit each month and never changes past months (FR-7.2)", async () => {
    const target = { scope: "category" as const, categoryId: food, accountId: null };
    await setBudgetLimit(db, target, 1_000_000, "2026-07");
    expect((await progressFor("2026-08"))[`category:${food}`].limit).toBe(1_000_000);

    await setBudgetLimit(db, target, 1_500_000, "2026-09");
    expect((await progressFor("2026-08"))[`category:${food}`].limit).toBe(1_000_000);
    expect((await progressFor("2026-09"))[`category:${food}`].limit).toBe(1_500_000);
    expect((await progressFor("2026-12", "2026-12-01"))[`category:${food}`].limit).toBe(1_500_000);

    // Removing from October keeps September and earlier.
    await setBudgetLimit(db, target, null, "2026-10");
    expect((await progressFor("2026-10", "2026-10-01"))[`category:${food}`]).toBeUndefined();
    expect((await progressFor("2026-09"))[`category:${food}`].limit).toBe(1_500_000);

    // Changing twice in the same month keeps one row for that month.
    await setBudgetLimit(db, target, 1_200_000, "2026-09");
    const rows = await db.getAllAsync<{ n: number }>("SELECT COUNT(*) AS n FROM budgets WHERE start_month = '2026-09'");
    expect(rows[0].n).toBe(1);
    expect((await progressFor("2026-09"))[`category:${food}`].limit).toBe(1_200_000);
  });

  it("does not carry unused budget into the next month (FR-7.2)", async () => {
    await setBudgetLimit(db, { scope: "overall", categoryId: null, accountId: null }, 1_000_000, "2026-08");
    await createEntry(db, { type: "expense", amount: 100_000, accountId: cash, categoryId: food, occurredOn: "2026-08-10", note: null });
    expect((await progressFor("2026-09"))["overall:"]).toMatchObject({ limit: 1_000_000, spent: 0 });
  });

  it("warns once per level per limit per month (FR-7.5)", async () => {
    await setBudgetLimit(db, { scope: "category", categoryId: food, accountId: null }, 100_000, "2026-09");
    const spend = (amount: number) =>
      createEntry(db, { type: "expense", amount, accountId: cash, categoryId: food, occurredOn: TODAY, note: null });

    await spend(70_000);
    expect(await checkBudgetAlerts(db, TODAY)).toEqual([]); // 70%

    await spend(6_000); // 76%
    expect((await checkBudgetAlerts(db, TODAY)).map((a) => a.level)).toEqual([75]);
    expect(await checkBudgetAlerts(db, TODAY)).toEqual([]); // not again

    await spend(30_000); // 106%: jumps past 90, reports only the highest
    expect((await checkBudgetAlerts(db, TODAY)).map((a) => a.level)).toEqual([100]);
    await spend(1_000);
    expect(await checkBudgetAlerts(db, TODAY)).toEqual([]);

    // A new month starts fresh.
    await createEntry(db, { type: "expense", amount: 95_000, accountId: cash, categoryId: food, occurredOn: "2026-10-02", note: null });
    expect((await checkBudgetAlerts(db, "2026-10-02")).map((a) => a.level)).toEqual([90]);
  });

  it("skips limits on archived accounts", async () => {
    await setBudgetLimit(db, { scope: "account", categoryId: null, accountId: cash }, 10_000, "2026-09");
    await createEntry(db, { type: "expense", amount: 20_000, accountId: cash, categoryId: food, occurredOn: TODAY, note: null });
    await setAccountArchived(db, cash, true);
    expect(await checkBudgetAlerts(db, TODAY)).toEqual([]);
  });
});

describeDb("reconciliation on a chosen date (decided for phase 3)", () => {
  it("compares with the balance on that date and dates the adjustment then", async () => {
    const db = await createTestDb();
    const cash = await createAccount(db, { name: "Cash", type: "cash", openingBalance: 500_000, alertLine: null });
    const food = await cat(db, "category.starter.food");
    await createEntry(db, { type: "expense", amount: 50_000, accountId: cash, categoryId: food, occurredOn: "2026-09-20", note: null });

    // On the 19th the app said 500,000 but the wallet held 480,000.
    const id = await reconcileAccount(db, cash, 480_000, "2026-09-19", TODAY);
    const adj = await db.getFirstAsync<{ amount: number; occurred_on: string }>("SELECT amount, occurred_on FROM entries WHERE id = ?", id);
    expect(adj).toEqual({ amount: -20_000, occurred_on: "2026-09-19" });
    expect((await listAccountsWithBalances(db, TODAY))[0].balance).toBe(430_000);

    await expect(reconcileAccount(db, cash, 1, "2026-09-22", TODAY)).rejects.toThrow("future_date");
  });
});

describeDb("search and filters (FR-8) — phase 3 exit check", () => {
  let db: SQLiteDatabase;
  let cash: number;
  let bca: number;
  let food: number;
  let transport: number;
  let salary: number;

  beforeEach(async () => {
    db = await createTestDb();
    cash = await createAccount(db, { name: "Cash", type: "cash", openingBalance: 1_000_000, alertLine: null });
    bca = await createAccount(db, { name: "BCA", type: "bank", openingBalance: 5_000_000, alertLine: null });
    food = await cat(db, "category.starter.food");
    transport = await cat(db, "category.starter.transport");
    salary = await cat(db, "category.starter.salary");

    await createEntry(db, { type: "expense", amount: 25_000, accountId: cash, categoryId: food, occurredOn: "2026-09-01", note: "Nasi goreng" });
    await createEntry(db, { type: "expense", amount: 50_000, accountId: cash, categoryId: food, occurredOn: "2026-09-10", note: "Coffee 100% arabica" });
    await createEntry(db, { type: "expense", amount: 15_000, accountId: bca, categoryId: transport, occurredOn: "2026-09-12", note: "Ojek" });
    await createEntry(db, { type: "income", amount: 8_000_000, accountId: bca, categoryId: salary, occurredOn: "2026-09-01", note: "Gaji" });
    await createTransfer(db, { fromAccountId: bca, toAccountId: cash, amount: 50_000, fee: 2_500, feePaidBy: "sender", occurredOn: "2026-09-15", note: "Top up" });
    await reconcileAccount(db, cash, 1_000_000, TODAY); // cash had 975,000 -> +25,000 unrecorded income
  });

  const run = async (f: Partial<SearchFilters>) => {
    const filters = { ...EMPTY_FILTERS, ...f };
    const rows = await searchRecords(db, filters, { limit: 100, offset: 0 });
    const summary = await summarizeSearch(db, filters);
    expect(summary.count).toBe(rows.length); // count always matches the list
    return { rows, summary };
  };

  it("with no filters shows everything, newest first (FR-8.4)", async () => {
    const { rows, summary } = await run({});
    expect(rows).toHaveLength(6);
    expect(rows[0].kind === "entry" && rows[0].entry.type).toBe("adjustment"); // dated today
    expect(summary).toEqual({ count: 6, spending: 90_000, income: 8_025_000, transferCount: 1, transferFees: 2_500 });
  });

  it("matches note text case-insensitively, treating % literally (FR-8.1)", async () => {
    expect((await run({ text: "nasi" })).rows).toHaveLength(1);
    expect((await run({ text: "100%" })).rows).toHaveLength(1);
    expect((await run({ text: "top" })).summary.transferCount).toBe(1);
  });

  it("matches an exact amount or a range (FR-8.1)", async () => {
    expect((await run({ minAmount: 50_000, maxAmount: 50_000 })).rows).toHaveLength(2); // expense + transfer
    expect((await run({ minAmount: 20_000, maxAmount: 30_000 })).rows).toHaveLength(2); // 25k expense + 25k adjustment
    expect((await run({ minAmount: 1_000_000 })).rows).toHaveLength(1);
  });

  it("combines account, categories, dates and types (FR-8.2)", async () => {
    const { rows, summary } = await run({ accountId: cash, categoryIds: [food], startDate: "2026-09-05", endDate: "2026-09-30" });
    expect(rows).toHaveLength(1);
    expect(summary.spending).toBe(50_000);

    expect((await run({ categoryIds: [food, transport] })).summary).toMatchObject({ count: 3, spending: 90_000, transferCount: 0 });
    expect((await run({ types: ["transfer"] })).summary).toMatchObject({ count: 1, spending: 0, transferFees: 2_500 });
    expect((await run({ types: ["adjustment", "income"] })).summary).toMatchObject({ count: 2, income: 8_025_000 });
    expect((await run({ accountId: cash, types: ["transfer"] })).rows).toHaveLength(1); // cash is the recipient
    expect((await run({ accountId: cash, types: ["income"] })).rows).toHaveLength(0);
  });

  it("pages through results without gaps or repeats", async () => {
    const filters = { ...EMPTY_FILTERS };
    const pageA = await searchRecords(db, filters, { limit: 4, offset: 0 });
    const pageB = await searchRecords(db, filters, { limit: 4, offset: 4 });
    const keys = [...pageA, ...pageB].map((r) => (r.kind === "entry" ? `e${r.entry.id}` : `t${r.transfer.id}`));
    expect(new Set(keys).size).toBe(6);
  });
});
