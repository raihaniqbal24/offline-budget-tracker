import type { SQLiteDatabase } from "expo-sqlite";
import { createTestDb, describeDb } from "../../test/testDb";
import { createAccount, listAccountsWithBalances } from "../../db/accountsDao";
import { createCategory, listCategories } from "../../db/categoriesDao";
import {
  createEntry,
  deleteEntry,
  getEntry,
  listEntries,
  restoreEntry,
} from "../../db/entriesDao";
import { createTransfer, listTransfers } from "../../db/transfersDao";
import { reconcileAccount } from "../../db/adjustmentsDao";
import { setBudgetLimit } from "../../db/budgetsDao";
import {
  getSchemaVersion,
  LATEST_SCHEMA_VERSION,
  runMigrations,
} from "../../db/migrations";
import * as m001 from "../../db/migrations/001_initial";
import { exportBackup, importMerge, importReplace } from "../backupDao";
import { validateBackup, type BackupFile } from "../format";

const TODAY = "2026-09-21";

async function cat(db: SQLiteDatabase, key: string): Promise<number> {
  return (await listCategories(db)).find((c) => c.i18nKey === key)!.id;
}

/** A phone with a bit of everything. */
async function seed(db: SQLiteDatabase) {
  const cash = await createAccount(db, {
    name: "Cash",
    type: "cash",
    openingBalance: 500_000,
    alertLine: 50_000,
  });
  const bca = await createAccount(db, {
    name: "BCA",
    type: "bank",
    openingBalance: 5_000_000,
    alertLine: null,
  });
  const coffee = await createCategory(db, {
    name: "Coffee",
    type: "expense",
    icon: "coffee",
    color: "#6B4F3A",
  });
  const food = await cat(db, "category.starter.food");
  await createEntry(db, {
    type: "expense",
    amount: 25_000,
    accountId: cash,
    categoryId: coffee,
    occurredOn: "2026-09-02",
    note: "Kopi, susu",
  });
  await createEntry(db, {
    type: "expense",
    amount: 40_000,
    accountId: cash,
    categoryId: food,
    occurredOn: "2026-09-03",
    note: null,
  });
  await createEntry(db, {
    type: "income",
    amount: 8_000_000,
    accountId: bca,
    categoryId: await cat(db, "category.starter.salary"),
    occurredOn: "2026-09-01",
    note: "Gaji",
  });
  await createTransfer(db, {
    fromAccountId: bca,
    toAccountId: cash,
    amount: 200_000,
    fee: 6_500,
    feePaidBy: "sender",
    occurredOn: "2026-09-05",
    note: null,
  });
  await reconcileAccount(db, cash, 600_000, TODAY);
  await setBudgetLimit(
    db,
    { scope: "category", categoryId: coffee, accountId: null },
    300_000,
    "2026-09",
  );
  return { cash, bca, coffee, food };
}

/** Export, then parse and validate as the import screen does. */
async function roundTrip(db: SQLiteDatabase): Promise<BackupFile> {
  const text = JSON.stringify(
    await exportBackup(db, "2026-09-21T10:00:00.000Z"),
  );
  const result = validateBackup(JSON.parse(text), LATEST_SCHEMA_VERSION);
  if (!result.ok) throw new Error(result.error);
  return result.backup;
}

const balances = async (db: SQLiteDatabase) =>
  Object.fromEntries(
    (await listAccountsWithBalances(db, TODAY)).map((a) => [a.name, a.balance]),
  );

describeDb("backup export and replace (FR-9.1, FR-9.4, FR-9.5)", () => {
  it("restores an identical copy on another phone", async () => {
    const phoneA = await createTestDb();
    await seed(phoneA);
    const backup = await roundTrip(phoneA);
    expect(backup.schemaVersion).toBe(LATEST_SCHEMA_VERSION);

    const phoneB = await createTestDb();
    await createAccount(phoneB, {
      name: "Old",
      type: "cash",
      openingBalance: 1,
      alertLine: null,
    });
    await importReplace(phoneB, backup);

    const again = await exportBackup(phoneB, backup.exportedAt);
    expect(again.data).toEqual(backup.data); // same rows, ids and uids
    expect(await balances(phoneB)).toEqual(await balances(phoneA));
  });

  it("rolls back completely if any row fails (FR-9.6 failure injection)", async () => {
    const db = await createTestDb();
    await seed(db);
    const before = await exportBackup(db, "x");

    const backup = await roundTrip(db);
    // Passes validation, but the database rejects it: an expense on an income category.
    const salary = backup.data.categories.find(
      (c) => c.i18n_key === "category.starter.salary",
    )!;
    backup.data.entries[backup.data.entries.length - 1] = {
      ...backup.data.entries[backup.data.entries.length - 1],
      type: "expense",
      category_id: salary.id,
      amount: 1,
    };

    await expect(importReplace(db, backup)).rejects.toThrow(
      /entry_category_mismatch/,
    );
    expect(await exportBackup(db, "x")).toEqual(before); // the delete was rolled back too
  });
});

describeDb("backup validation (FR-9.3)", () => {
  let good: BackupFile;
  beforeAll(async () => {
    const db = await createTestDb();
    await seed(db);
    good = await roundTrip(db);
  });

  const check = (mutate: (b: any) => void) => {
    const copy = JSON.parse(JSON.stringify(good));
    mutate(copy);
    return validateBackup(copy, LATEST_SCHEMA_VERSION);
  };

  it.each([
    ["not a backup", (b: any) => (b.format = "something-else"), "not_a_backup"],
    [
      "from a newer app",
      (b: any) => (b.schemaVersion = LATEST_SCHEMA_VERSION + 1),
      "newer_version",
    ],
    ["missing a table", (b: any) => delete b.data.entries, "missing_table"],
    [
      "wrong value type",
      (b: any) => (b.data.entries[0].amount = "25000"),
      "bad_row",
    ],
    ["missing a column", (b: any) => delete b.data.accounts[0].name, "bad_row"],
    [
      "broken reference",
      (b: any) => (b.data.entries[0].account_id = 999),
      "broken_reference",
    ],
    [
      "duplicate id",
      (b: any) => (b.data.entries[1].id = b.data.entries[0].id),
      "duplicate_id",
    ],
    [
      "no built-in categories",
      (b: any) => {
        b.data.categories = b.data.categories.filter(
          (c: any) => !c.builtin_key,
        );
        b.data.entries = b.data.entries.filter(
          (e: any) => e.type !== "adjustment",
        ); // it used Unrecorded
      },
      "missing_builtin_categories",
    ],
  ])("rejects a file %s", (_label, mutate, error) => {
    expect(check(mutate)).toMatchObject({ ok: false, error });
  });

  it("rejects text that is not a backup object", () => {
    expect(validateBackup(null, 2)).toMatchObject({ ok: false });
    expect(validateBackup([1, 2], 2)).toMatchObject({ ok: false });
  });
});

describeDb("merge import (FR-9.4, decided: duplicates by uid)", () => {
  it("adds new records, maps same-named accounts and categories, and skips on a second import", async () => {
    const phoneA = await createTestDb();
    await seed(phoneA);
    const backup = await roundTrip(phoneA);

    const phoneB = await createTestDb();
    const bCash = await createAccount(phoneB, {
      name: "cash",
      type: "cash",
      openingBalance: 100_000,
      alertLine: null,
    });
    await createEntry(phoneB, {
      type: "expense",
      amount: 9_000,
      accountId: bCash,
      categoryId: await cat(phoneB, "category.starter.food"),
      occurredOn: TODAY,
      note: "B's own",
    });

    const first = await importMerge(phoneB, backup);
    expect(first.added).toMatchObject({
      accounts: 1,
      categories: 1,
      entries: 4,
      transfers: 1,
      budgets: 1,
    });
    expect(first.skipped).toMatchObject({ accounts: 1, categories: 10 }); // Cash and the seeded categories matched

    const accounts = await listAccountsWithBalances(phoneB, TODAY);
    expect(accounts.map((a) => a.name).sort()).toEqual(["BCA", "cash"]);
    const entries = await listEntries(phoneB, { limit: 50 });
    expect(entries.filter((e) => e.accountId === bCash)).toHaveLength(4); // B's own + A's three Cash entries
    expect((await listTransfers(phoneB, { limit: 10 }))[0]).toMatchObject({
      toAccountName: "cash",
      fee: 6_500,
    });

    const second = await importMerge(phoneB, backup);
    expect(second.added).toMatchObject({
      accounts: 0,
      categories: 0,
      entries: 0,
      transfers: 0,
      budgets: 0,
    });
    expect(await listEntries(phoneB, { limit: 50 })).toHaveLength(5);
  });

  it("keeps two identical-looking entries when their uids differ", async () => {
    const phoneA = await createTestDb();
    const cash = await createAccount(phoneA, {
      name: "Cash",
      type: "cash",
      openingBalance: 0,
      alertLine: null,
    });
    const food = await cat(phoneA, "category.starter.food");
    await createEntry(phoneA, {
      type: "expense",
      amount: 5_000,
      accountId: cash,
      categoryId: food,
      occurredOn: TODAY,
      note: "Parking",
    });
    await createEntry(phoneA, {
      type: "expense",
      amount: 5_000,
      accountId: cash,
      categoryId: food,
      occurredOn: TODAY,
      note: "Parking",
    });

    const phoneB = await createTestDb();
    await importMerge(phoneB, await roundTrip(phoneA));
    expect(await listEntries(phoneB, { limit: 10 })).toHaveLength(2);
  });

  it("matches records from an old backup without uids by content", async () => {
    const phone = await createTestDb();
    await seed(phone);
    const current = await roundTrip(phone);

    // Make it look like a version 1 backup: no uid columns.
    const v1 = JSON.parse(JSON.stringify(current));
    v1.schemaVersion = 1;
    for (const rows of Object.values(v1.data) as any[][])
      for (const row of rows) delete row.uid;
    v1.data.entries.push({
      ...v1.data.entries[0],
      id: 9999,
      amount: 12_345,
      note: "only in the old backup",
    });

    const result = validateBackup(v1, LATEST_SCHEMA_VERSION);
    expect(result.ok).toBe(true);
    const summary = await importMerge(
      phone,
      (result as { backup: BackupFile }).backup,
    );
    expect(summary.added.entries).toBe(1); // just the new one
    expect(summary.skipped.entries).toBe(current.data.entries.length);
  });

  it("rolls back a merge that fails part-way", async () => {
    const phoneA = await createTestDb();
    await seed(phoneA);
    const backup = await roundTrip(phoneA);
    backup.data.entries[backup.data.entries.length - 1].type = "not-a-type";

    const phoneB = await createTestDb();
    await createAccount(phoneB, {
      name: "Wallet",
      type: "cash",
      openingBalance: 1,
      alertLine: null,
    });
    const before = await exportBackup(phoneB, "x");
    await expect(importMerge(phoneB, backup)).rejects.toThrow();
    expect(await exportBackup(phoneB, "x")).toEqual(before);
  });
});

describeDb("record uids (migration 2)", () => {
  it("keeps all data when upgrading a version 1 database (NFR-8)", async () => {
    const db = await createTestDb({ migrate: false });
    await db.withTransactionAsync(async () => {
      await m001.up(db);
      await db.execAsync("PRAGMA user_version = 1;");
    });
    // Data written by the version 1 app.
    await db.execAsync(`
      INSERT INTO accounts (name, type, opening_balance) VALUES ('Cash', 'cash', 100000);
      INSERT INTO entries (type, amount, account_id, category_id, occurred_on, note)
        VALUES ('expense', 25000, 1, (SELECT id FROM categories WHERE i18n_key = 'category.starter.food'), '2026-09-20', 'Lunch');
    `);

    await runMigrations(db);
    expect(await getSchemaVersion(db)).toBe(LATEST_SCHEMA_VERSION);
    const [entry] = await listEntries(db, { limit: 5 });
    expect(entry).toMatchObject({ amount: 25_000, note: "Lunch" });
    expect(entry.uid).toMatch(/^[0-9a-f]{32}$/);
    expect((await listAccountsWithBalances(db, TODAY))[0].balance).toBe(75_000);
    const nullUids = await db.getFirstAsync<{ n: number }>(
      "SELECT COUNT(*) AS n FROM categories WHERE uid IS NULL",
    );
    expect(nullUids!.n).toBe(0);
  });

  it("gives every new record its own uid and keeps it through delete and undo", async () => {
    const db = await createTestDb();
    const cash = await createAccount(db, {
      name: "Cash",
      type: "cash",
      openingBalance: 0,
      alertLine: null,
    });
    const food = await cat(db, "category.starter.food");
    const a = await createEntry(db, {
      type: "expense",
      amount: 1,
      accountId: cash,
      categoryId: food,
      occurredOn: TODAY,
      note: null,
    });
    const b = await createEntry(db, {
      type: "expense",
      amount: 1,
      accountId: cash,
      categoryId: food,
      occurredOn: TODAY,
      note: null,
    });
    const entryA = (await getEntry(db, a))!;
    expect(entryA.uid).not.toBe((await getEntry(db, b))!.uid);

    await deleteEntry(db, a);
    await restoreEntry(db, entryA);
    expect((await getEntry(db, a))!.uid).toBe(entryA.uid);
  });
});
