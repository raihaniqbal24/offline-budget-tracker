import type { SQLiteDatabase } from "expo-sqlite";
import { createTestDb, describeDb } from "../../test/testDb";
import {
  createAccount,
  listAccountsWithBalances,
  updateAccount,
} from "../accountsDao";
import { checkBalanceAlerts } from "../alertsDao";
import { listCategories } from "../categoriesDao";
import { createEntry, deleteEntry } from "../entriesDao";

const TODAY = "2026-09-21";

describeDb("balance alerts (FR-10.4, FR-10.5)", () => {
  let db: SQLiteDatabase;
  let cash: number;
  let food: number;
  const check = async () =>
    (
      await checkBalanceAlerts(db, await listAccountsWithBalances(db, TODAY))
    ).map((a) => a.name);
  const spend = (amount: number) =>
    createEntry(db, {
      type: "expense",
      amount,
      accountId: cash,
      categoryId: food,
      occurredOn: TODAY,
      note: null,
    });

  beforeEach(async () => {
    db = await createTestDb();
    cash = await createAccount(db, {
      name: "Cash",
      type: "cash",
      openingBalance: 100_000,
      alertLine: 50_000,
    });
    food = (await listCategories(db)).find(
      (c) => c.i18nKey === "category.starter.food",
    )!.id;
  });

  it("reports one notification per crossing", async () => {
    expect(await check()).toEqual([]); // 100k: above the line

    await spend(50_000); // exactly at the line counts (FR-10.3)
    expect(await check()).toEqual(["Cash"]);
    await spend(10_000); // still below: no repeat
    expect(await check()).toEqual([]);
  });

  it("reports again only after rising above the line and dropping again", async () => {
    const id = await spend(60_000);
    expect(await check()).toEqual(["Cash"]);
    await deleteEntry(db, id); // back to 100k
    expect(await check()).toEqual([]);
    await spend(70_000);
    expect(await check()).toEqual(["Cash"]);
  });

  it("treats a removed alert line as above, and ignores archived accounts", async () => {
    await spend(60_000);
    expect(await check()).toEqual(["Cash"]);
    await updateAccount(db, cash, {
      name: "Cash",
      type: "cash",
      openingBalance: 100_000,
      alertLine: null,
    });
    expect(await check()).toEqual([]);
    await updateAccount(db, cash, {
      name: "Cash",
      type: "cash",
      openingBalance: 100_000,
      alertLine: 50_000,
    });
    expect(await check()).toEqual(["Cash"]); // a new crossing once the line is back
  });
});
