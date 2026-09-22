import type { SQLiteDatabase } from "expo-sqlite";
import { createTestDb, describeDb } from "../../test/testDb";
import { createAccount, listAccountsWithBalances } from "../accountsDao";
import { listCategories } from "../categoriesDao";
import { createEntry, getPeriodTotals, listEntries } from "../entriesDao";
import { createTransfer, deleteTransfer, listTransfers, updateTransfer } from "../transfersDao";
import { categorizeAdjustment, reconcileAccount, splitAdjustment } from "../adjustmentsDao";
import { getCategoryBreakdown, getSpendingTrend, hasActivity } from "../summariesDao";
import { addDays, getPeriodRange, shiftPeriod, type PeriodType } from "../../lib/dates";

const TODAY = "2026-09-21";

async function cat(db: SQLiteDatabase, key: string): Promise<number> {
  const all = await listCategories(db);
  return all.find((c) => c.i18nKey === key || c.builtinKey === key)!.id;
}

async function balanceOf(db: SQLiteDatabase, id: number, today = TODAY): Promise<number> {
  return (await listAccountsWithBalances(db, today)).find((a) => a.id === id)!.balance;
}

async function combined(db: SQLiteDatabase, today = TODAY): Promise<number> {
  return (await listAccountsWithBalances(db, today)).reduce((s, a) => s + a.balance, 0);
}

describeDb("transfers (FR-5)", () => {
  let db: SQLiteDatabase;
  let bca: number;
  let gopay: number;

  beforeEach(async () => {
    db = await createTestDb();
    bca = await createAccount(db, { name: "BCA", type: "bank", openingBalance: 5_000_000, alertLine: null });
    gopay = await createAccount(db, { name: "GoPay", type: "ewallet", openingBalance: 100_000, alertLine: null });
  });

  it("sender pays: sender loses amount + fee, recipient gets the full amount (FR-5.3)", async () => {
    const before = await combined(db);
    await createTransfer(db, { fromAccountId: bca, toAccountId: gopay, amount: 1_000_000, fee: 6_500, feePaidBy: "sender", occurredOn: TODAY, note: null });

    expect(await balanceOf(db, bca)).toBe(5_000_000 - 1_006_500);
    expect(await balanceOf(db, gopay)).toBe(1_100_000);
    // Phase 2 exit check: the combined balance changes only by the fee.
    expect(await combined(db)).toBe(before - 6_500);
  });

  it("recipient pays: recipient gets amount - fee (FR-5.4)", async () => {
    const before = await combined(db);
    await createTransfer(db, { fromAccountId: bca, toAccountId: gopay, amount: 1_000_000, fee: 2_500, feePaidBy: "recipient", occurredOn: TODAY, note: null });

    expect(await balanceOf(db, bca)).toBe(4_000_000);
    expect(await balanceOf(db, gopay)).toBe(100_000 + 997_500);
    expect(await combined(db)).toBe(before - 2_500);
  });

  it("counts only the fee as spending, under Transfer fees, on the paying account (FR-5.5)", async () => {
    await createTransfer(db, { fromAccountId: bca, toAccountId: gopay, amount: 1_000_000, fee: 6_500, feePaidBy: "sender", occurredOn: TODAY, note: null });
    await createTransfer(db, { fromAccountId: gopay, toAccountId: bca, amount: 50_000, fee: 1_000, feePaidBy: "recipient", occurredOn: TODAY, note: null });
    const month = getPeriodRange("month", TODAY);

    expect(await getPeriodTotals(db, month, TODAY)).toEqual({ spending: 7_500, income: 0, net: -7_500 });
    const [slice] = await getCategoryBreakdown(db, month, TODAY);
    expect(slice).toMatchObject({ builtinKey: "transfer_fees", amount: 7_500 });
    expect((await getPeriodTotals(db, month, TODAY, bca)).spending).toBe(6_500 + 1_000); // paid 6.5k as sender, 1k as recipient
    expect((await getPeriodTotals(db, month, TODAY, gopay)).spending).toBe(0);
  });

  it("updates both balances on edit and delete, and applies future-dated transfers on their date (FR-5.7)", async () => {
    const id = await createTransfer(db, { fromAccountId: bca, toAccountId: gopay, amount: 200_000, fee: 0, feePaidBy: "sender", occurredOn: TODAY, note: null });
    await updateTransfer(db, id, { fromAccountId: gopay, toAccountId: bca, amount: 50_000, fee: 0, feePaidBy: "sender", occurredOn: TODAY, note: null });
    expect(await balanceOf(db, bca)).toBe(5_050_000);
    expect(await balanceOf(db, gopay)).toBe(50_000);

    await deleteTransfer(db, id);
    expect(await balanceOf(db, bca)).toBe(5_000_000);

    await createTransfer(db, { fromAccountId: bca, toAccountId: gopay, amount: 300_000, fee: 0, feePaidBy: "sender", occurredOn: addDays(TODAY, 3), note: null });
    expect(await balanceOf(db, gopay)).toBe(100_000);
    expect(await balanceOf(db, gopay, addDays(TODAY, 3))).toBe(400_000);
  });

  it("rejects invalid transfers", async () => {
    const base = { fromAccountId: bca, toAccountId: gopay, amount: 10_000, fee: 0, feePaidBy: "sender" as const, occurredOn: TODAY, note: null };
    await expect(createTransfer(db, { ...base, toAccountId: bca })).rejects.toThrow("same_account");
    await expect(createTransfer(db, { ...base, amount: 0 })).rejects.toThrow("invalid_amount");
    await expect(createTransfer(db, { ...base, fee: 20_000, feePaidBy: "recipient" })).rejects.toThrow("fee_exceeds_amount");
  });

  it("filters the list by account and date (FR-5.6)", async () => {
    const cash = await createAccount(db, { name: "Cash", type: "cash", openingBalance: 0, alertLine: null });
    await createTransfer(db, { fromAccountId: bca, toAccountId: gopay, amount: 1, fee: 0, feePaidBy: "sender", occurredOn: "2026-08-10", note: null });
    await createTransfer(db, { fromAccountId: gopay, toAccountId: cash, amount: 2, fee: 0, feePaidBy: "sender", occurredOn: TODAY, note: null });

    expect(await listTransfers(db, { limit: 10, accountId: bca })).toHaveLength(1);
    expect(await listTransfers(db, { limit: 10, accountId: gopay })).toHaveLength(2);
    expect(await listTransfers(db, { limit: 10, range: getPeriodRange("month", TODAY) })).toHaveLength(1);
    const [latest] = await listTransfers(db, { limit: 1 });
    expect(latest).toMatchObject({ fromAccountName: "GoPay", toAccountName: "Cash" });
  });
});

describeDb("reconciliation (FR-1.4 to FR-1.7)", () => {
  let db: SQLiteDatabase;
  let cash: number;
  let food: number;
  let transport: number;
  let salary: number;

  beforeEach(async () => {
    db = await createTestDb();
    cash = await createAccount(db, { name: "Cash", type: "cash", openingBalance: 500_000, alertLine: null });
    food = await cat(db, "category.starter.food");
    transport = await cat(db, "category.starter.transport");
    salary = await cat(db, "category.starter.salary");
  });

  it("records the difference so the balance matches the real one", async () => {
    const id = await reconcileAccount(db, cash, 350_000, TODAY);
    expect(id).not.toBeNull();
    expect(await balanceOf(db, cash)).toBe(350_000);

    const month = getPeriodRange("month", TODAY);
    expect(await getPeriodTotals(db, month, TODAY)).toEqual({ spending: 150_000, income: 0, net: -150_000 });
    const [slice] = await getCategoryBreakdown(db, month, TODAY);
    expect(slice).toMatchObject({ builtinKey: "unrecorded", amount: 150_000 }); // FR-3.6

    expect(await reconcileAccount(db, cash, 350_000, TODAY)).toBeNull(); // already matches
  });

  it("treats a higher real balance as unrecorded income (FR-1.5)", async () => {
    await reconcileAccount(db, cash, 520_000, TODAY);
    expect((await getPeriodTotals(db, getPeriodRange("month", TODAY), TODAY)).income).toBe(20_000);
  });

  it("categorizes a whole adjustment into a normal entry (FR-1.6)", async () => {
    const id = (await reconcileAccount(db, cash, 450_000, TODAY))!;
    await categorizeAdjustment(db, id, food, "Street food");

    const [entry] = await listEntries(db, { limit: 5 });
    expect(entry).toMatchObject({ id, type: "expense", amount: 50_000, categoryId: food, note: "Street food" });
    expect(await balanceOf(db, cash)).toBe(450_000);
  });

  it("splits an adjustment and keeps the remainder as Unrecorded (FR-1.7)", async () => {
    const id = (await reconcileAccount(db, cash, 400_000, TODAY))!; // -100,000
    const remaining = await splitAdjustment(db, id, [
      { categoryId: food, amount: 60_000, note: null },
      { categoryId: transport, amount: 25_000, note: "Ojek" },
    ]);

    expect(remaining).toBe(-15_000);
    expect(await balanceOf(db, cash)).toBe(400_000); // balance unchanged by splitting
    const adjustments = await listEntries(db, { limit: 10, type: "adjustment" });
    expect(adjustments).toHaveLength(1);
    expect(adjustments[0].amount).toBe(-15_000);
  });

  it("removes the adjustment when the split explains all of it", async () => {
    const id = (await reconcileAccount(db, cash, 400_000, TODAY))!;
    expect(await splitAdjustment(db, id, [{ categoryId: food, amount: 100_000, note: null }])).toBe(0);
    expect(await listEntries(db, { limit: 10, type: "adjustment" })).toHaveLength(0);
    expect(await balanceOf(db, cash)).toBe(400_000);
  });

  it("rejects a split larger than the adjustment", async () => {
    const id = (await reconcileAccount(db, cash, 400_000, TODAY))!;
    await expect(splitAdjustment(db, id, [{ categoryId: food, amount: 100_001, note: null }])).rejects.toThrow("split_exceeds_adjustment");
  });

  it("rolls back the whole split if any part fails (NFR-6 failure injection)", async () => {
    const id = (await reconcileAccount(db, cash, 400_000, TODAY))!;
    const before = await listEntries(db, { limit: 50 });

    // The second part uses an income category on a spending adjustment, which the
    // database trigger rejects after the first part has already been written.
    await expect(
      splitAdjustment(db, id, [
        { categoryId: food, amount: 30_000, note: null },
        { categoryId: salary, amount: 20_000, note: null },
      ])
    ).rejects.toThrow(/entry_category_mismatch/);

    expect(await listEntries(db, { limit: 50 })).toEqual(before);
    expect(await balanceOf(db, cash)).toBe(400_000);
  });
});

describeDb("summaries (FR-3) — phase 2 exit check", () => {
  it("totals, breakdown and trend equal the entry list in all four periods", async () => {
    const db = await createTestDb();
    const accounts = [
      await createAccount(db, { name: "Cash", type: "cash", openingBalance: 1_000_000, alertLine: null }),
      await createAccount(db, { name: "BCA", type: "bank", openingBalance: 9_000_000, alertLine: null }),
      await createAccount(db, { name: "GoPay", type: "ewallet", openingBalance: 200_000, alertLine: null }),
    ];
    const expense = [await cat(db, "category.starter.food"), await cat(db, "category.starter.bills"), await cat(db, "category.starter.transport")];
    const income = await cat(db, "category.starter.salary");

    let seed = 7;
    const rnd = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    const randomDate = () => addDays("2026-01-01", rnd(290)); // includes some future dates
    for (let i = 0; i < 600; i++) {
      const account = accounts[rnd(3)];
      const kind = rnd(10);
      const amount = 1_000 + rnd(500_000);
      if (kind < 6) await createEntry(db, { type: "expense", amount, accountId: account, categoryId: expense[rnd(3)], occurredOn: randomDate(), note: null });
      else if (kind < 8) await createEntry(db, { type: "income", amount, accountId: account, categoryId: income, occurredOn: randomDate(), note: null });
      else {
        const to = accounts[(accounts.indexOf(account) + 1 + rnd(2)) % 3];
        await createTransfer(db, { fromAccountId: account, toAccountId: to, amount: amount + 10_000, fee: rnd(2) ? 6_500 : 0, feePaidBy: rnd(2) ? "sender" : "recipient", occurredOn: randomDate(), note: null });
      }
    }
    await reconcileAccount(db, accounts[0], 123_456, TODAY);

    const allEntries = await listEntries(db, { limit: 10_000 });
    const allTransfers = await listTransfers(db, { limit: 10_000 });

    const types: PeriodType[] = ["day", "week", "month", "year"];
    for (const type of types) {
      let anchor = TODAY;
      for (let step = 0; step < 4; step++, anchor = shiftPeriod(type, anchor, -1)) {
        const range = getPeriodRange(type, anchor);
        const end = range.end < TODAY ? range.end : TODAY;
        const inRange = (d: string) => d >= range.start && d <= end;

        // Hand-sum from the lists, independently of v_cashflow.
        let spending = 0;
        let incomeSum = 0;
        for (const e of allEntries.filter((e) => inRange(e.occurredOn))) {
          if (e.type === "expense" || (e.type === "adjustment" && e.amount < 0)) spending += Math.abs(e.amount);
          else incomeSum += Math.abs(e.amount);
        }
        for (const t of allTransfers.filter((t) => inRange(t.occurredOn))) spending += t.fee;

        const totals = await getPeriodTotals(db, range, TODAY);
        expect({ type, anchor, spending: totals.spending, income: totals.income }).toEqual({ type, anchor, spending, income: incomeSum });

        const breakdown = await getCategoryBreakdown(db, range, TODAY);
        expect(breakdown.reduce((s, c) => s + c.amount, 0)).toBe(spending);

        if (type !== "day") {
          const trend = await getSpendingTrend(db, range, TODAY, type === "year" ? "month" : "day");
          expect([...trend.values()].reduce((s, v) => s + v, 0)).toBe(spending);
        }
      }
    }
  });

  it("reports whether a period has any activity (FR-3.9)", async () => {
    const db = await createTestDb();
    const cash = await createAccount(db, { name: "Cash", type: "cash", openingBalance: 0, alertLine: null });
    await createEntry(db, { type: "expense", amount: 1_000, accountId: cash, categoryId: await cat(db, "category.starter.food"), occurredOn: "2026-08-15", note: null });

    expect(await hasActivity(db, getPeriodRange("month", "2026-08-01"), TODAY)).toBe(true);
    expect(await hasActivity(db, getPeriodRange("month", "2026-07-01"), TODAY)).toBe(false);
  });
});