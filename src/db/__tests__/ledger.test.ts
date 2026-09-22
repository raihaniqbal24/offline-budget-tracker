import type { SQLiteDatabase } from "expo-sqlite";
import { createTestDb, describeDb } from "../../test/testDb";
import {
  createAccount,
  listAccountsWithBalances,
  setAccountArchived,
} from "../accountsDao";
import { listCategories } from "../categoriesDao";
import {
  createEntry,
  deleteEntry,
  getPeriodTotals,
  listEntries,
  restoreEntry,
  updateEntry,
} from "../entriesDao";
import { getPeriodRange } from "../../lib/dates";

const TODAY = "2026-09-21";

async function categoryId(
  db: SQLiteDatabase,
  i18nKey: string,
): Promise<number> {
  const cats = await listCategories(db);
  return cats.find((c) => c.i18nKey === i18nKey)!.id;
}

async function balances(
  db: SQLiteDatabase,
  today = TODAY,
): Promise<Record<string, number>> {
  const accounts = await listAccountsWithBalances(db, today);
  return Object.fromEntries(accounts.map((a) => [a.name, a.balance]));
}

describeDb("ledger (phase 1)", () => {
  let db: SQLiteDatabase;
  let food: number;
  let salary: number;

  beforeEach(async () => {
    db = await createTestDb();
    food = await categoryId(db, "category.starter.food");
    salary = await categoryId(db, "category.starter.salary");
  });

  it("matches a hand calculation across accounts (phase 1 exit check)", async () => {
    const cash = await createAccount(db, {
      name: "Cash",
      type: "cash",
      openingBalance: 500_000,
      alertLine: null,
    });
    const bank = await createAccount(db, {
      name: "BCA",
      type: "bank",
      openingBalance: 2_000_000,
      alertLine: null,
    });

    await createEntry(db, {
      type: "expense",
      amount: 35_000,
      accountId: cash,
      categoryId: food,
      occurredOn: "2026-09-20",
      note: "Lunch",
    });
    await createEntry(db, {
      type: "expense",
      amount: 15_000,
      accountId: cash,
      categoryId: food,
      occurredOn: TODAY,
      note: null,
    });
    await createEntry(db, {
      type: "income",
      amount: 8_000_000,
      accountId: bank,
      categoryId: salary,
      occurredOn: "2026-09-01",
      note: null,
    });
    await createEntry(db, {
      type: "expense",
      amount: 120_000,
      accountId: bank,
      categoryId: food,
      occurredOn: "2026-09-15",
      note: null,
    });

    expect(await balances(db)).toEqual({
      Cash: 500_000 - 35_000 - 15_000, // 450,000
      BCA: 2_000_000 + 8_000_000 - 120_000, // 9,880,000
    });
  });

  it("applies future-dated entries only once their date arrives (FR-2.3)", async () => {
    const cash = await createAccount(db, {
      name: "Cash",
      type: "cash",
      openingBalance: 100_000,
      alertLine: null,
    });
    await createEntry(db, {
      type: "expense",
      amount: 40_000,
      accountId: cash,
      categoryId: food,
      occurredOn: "2026-09-25",
      note: null,
    });

    expect((await balances(db, TODAY)).Cash).toBe(100_000);
    expect((await balances(db, "2026-09-25")).Cash).toBe(60_000);

    const month = getPeriodRange("month", TODAY);
    expect((await getPeriodTotals(db, month, TODAY)).spending).toBe(0);
    expect((await getPeriodTotals(db, month, "2026-09-25")).spending).toBe(
      40_000,
    );
  });

  it("allows negative balances and flags the alert line (FR-1.3, FR-10.3)", async () => {
    const card = await createAccount(db, {
      name: "PayLater",
      type: "other",
      openingBalance: 0,
      alertLine: 0,
    });
    const wallet = await createAccount(db, {
      name: "GoPay",
      type: "ewallet",
      openingBalance: 200_000,
      alertLine: 50_000,
    });
    await createEntry(db, {
      type: "expense",
      amount: 75_000,
      accountId: card,
      categoryId: food,
      occurredOn: TODAY,
      note: null,
    });

    const accounts = await listAccountsWithBalances(db, TODAY);
    const byId = Object.fromEntries(accounts.map((a) => [a.id, a]));
    expect(byId[card].balance).toBe(-75_000);
    expect(byId[card].isBelowAlertLine).toBe(true);
    expect(byId[wallet].isBelowAlertLine).toBe(false);
  });

  it("restores a deleted entry exactly on undo (FR-2.7)", async () => {
    const cash = await createAccount(db, {
      name: "Cash",
      type: "cash",
      openingBalance: 100_000,
      alertLine: null,
    });
    const id = await createEntry(db, {
      type: "expense",
      amount: 25_000,
      accountId: cash,
      categoryId: food,
      occurredOn: TODAY,
      note: "Coffee",
    });

    const deleted = await deleteEntry(db, id);
    expect((await balances(db)).Cash).toBe(100_000);

    await restoreEntry(db, deleted!);
    const [restored] = await listEntries(db, { limit: 10 });
    expect(restored).toMatchObject({
      id,
      amount: 25_000,
      note: "Coffee",
      createdAt: deleted!.createdAt,
    });
    expect((await balances(db)).Cash).toBe(75_000);
  });

  it("switches an entry between expense and income with a matching category (FR-4.1)", async () => {
    const cash = await createAccount(db, {
      name: "Cash",
      type: "cash",
      openingBalance: 0,
      alertLine: null,
    });
    const id = await createEntry(db, {
      type: "expense",
      amount: 10_000,
      accountId: cash,
      categoryId: food,
      occurredOn: TODAY,
      note: null,
    });

    await expect(
      updateEntry(db, id, {
        type: "income",
        amount: 10_000,
        accountId: cash,
        categoryId: food,
        occurredOn: TODAY,
        note: null,
      }),
    ).rejects.toThrow(/entry_category_mismatch/);

    await updateEntry(db, id, {
      type: "income",
      amount: 10_000,
      accountId: cash,
      categoryId: salary,
      occurredOn: TODAY,
      note: null,
    });
    expect((await balances(db)).Cash).toBe(10_000);

    const totals = await getPeriodTotals(
      db,
      getPeriodRange("month", TODAY),
      TODAY,
    );
    expect(totals).toEqual({ spending: 0, income: 10_000, net: 10_000 });
  });

  it("keeps an archived account's history and balance (FR-1.8)", async () => {
    const cash = await createAccount(db, {
      name: "Old wallet",
      type: "cash",
      openingBalance: 50_000,
      alertLine: null,
    });
    await createEntry(db, {
      type: "expense",
      amount: 5_000,
      accountId: cash,
      categoryId: food,
      occurredOn: TODAY,
      note: null,
    });
    await setAccountArchived(db, cash, true);

    const [account] = await listAccountsWithBalances(db, TODAY);
    expect(account).toMatchObject({ archived: true, balance: 45_000 });
    expect(await listEntries(db, { limit: 10 })).toHaveLength(1);
  });

  it("rejects invalid amounts before writing", async () => {
    const cash = await createAccount(db, {
      name: "Cash",
      type: "cash",
      openingBalance: 0,
      alertLine: null,
    });
    await expect(
      createEntry(db, {
        type: "expense",
        amount: 0,
        accountId: cash,
        categoryId: food,
        occurredOn: TODAY,
        note: null,
      }),
    ).rejects.toThrow("invalid_amount");
    await expect(
      createEntry(db, {
        type: "expense",
        amount: 12.5,
        accountId: cash,
        categoryId: food,
        occurredOn: TODAY,
        note: null,
      }),
    ).rejects.toThrow("invalid_amount");
  });
});
