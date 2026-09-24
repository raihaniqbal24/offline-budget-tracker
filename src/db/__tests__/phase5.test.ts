import type { SQLiteDatabase } from "expo-sqlite";
import { createTestDb, describeDb } from "../../test/testDb";
import { createAccount, listAccountsWithBalances } from "../accountsDao";
import { listCategories } from "../categoriesDao";
import { getPeriodTotals, listEntries } from "../entriesDao";
import { listTransfers } from "../transfersDao";
import {
  confirmPendingEntry,
  countPendingEntries,
  createRule,
  generatePendingEntries,
  listPendingEntries,
  setRuleArchived,
  skipPendingEntry,
  updateRule,
  validateRule,
  type RecurringInput,
} from "../recurringDao";
import {
  addMovement,
  createGoal,
  getTotalInGoals,
  listGoals,
  listMovements,
  updateGoal,
} from "../goalsDao";
import { getPeriodRange } from "../../lib/dates";

const TODAY = "2026-09-21";

async function cat(db: SQLiteDatabase, key: string): Promise<number> {
  return (await listCategories(db)).find((c) => c.i18nKey === key)!.id;
}

const balances = async (db: SQLiteDatabase, today = TODAY) =>
  Object.fromEntries(
    (await listAccountsWithBalances(db, today)).map((a) => [a.name, a.balance]),
  );

describeDb("recurring rules (FR-11)", () => {
  let db: SQLiteDatabase;
  let cash: number;
  let bca: number;
  let bills: number;
  let salary: number;

  const rule = (over: Partial<RecurringInput> = {}): RecurringInput => ({
    type: "expense",
    amount: 500_000,
    accountId: cash,
    toAccountId: null,
    categoryId: bills,
    fee: 0,
    feePaidBy: "sender",
    note: "Kos",
    frequency: "monthly",
    startDate: "2026-07-01",
    endDate: null,
    ...over,
  });

  beforeEach(async () => {
    db = await createTestDb();
    cash = await createAccount(db, {
      name: "Cash",
      type: "cash",
      openingBalance: 5_000_000,
      alertLine: null,
    });
    bca = await createAccount(db, {
      name: "BCA",
      type: "bank",
      openingBalance: 9_000_000,
      alertLine: null,
    });
    bills = await cat(db, "category.starter.bills");
    salary = await cat(db, "category.starter.salary");
  });

  it("adds one pending entry per due occurrence, including missed ones, and never twice (FR-11.2)", async () => {
    await createRule(db, rule());
    expect(await generatePendingEntries(db, TODAY)).toBe(3); // July, August, September
    expect(await generatePendingEntries(db, TODAY)).toBe(0); // running again adds nothing
    expect((await listPendingEntries(db)).map((p) => p.dueDate)).toEqual([
      "2026-07-01",
      "2026-08-01",
      "2026-09-01",
    ]);

    // Nothing has touched a balance yet (FR-11.4).
    expect((await balances(db)).Cash).toBe(5_000_000);
    expect(await listEntries(db, { limit: 10 })).toHaveLength(0);
  });

  it("does not generate anything beyond today or the end date", async () => {
    await createRule(
      db,
      rule({
        frequency: "weekly",
        startDate: "2026-09-07",
        endDate: "2026-09-15",
      }),
    );
    await generatePendingEntries(db, TODAY);
    expect((await listPendingEntries(db)).map((p) => p.dueDate)).toEqual([
      "2026-09-07",
      "2026-09-14",
    ]);
  });

  it("keeps a monthly rule on the 31st, using the last day of shorter months (FR-11.6)", async () => {
    await createRule(db, rule({ startDate: "2026-01-31" }));
    await generatePendingEntries(db, "2026-05-01");
    expect((await listPendingEntries(db)).map((p) => p.dueDate)).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ]);
  });

  it("confirms into an entry dated the due date, optionally with a new amount (FR-11.4, FR-11.5)", async () => {
    await createRule(db, rule());
    await generatePendingEntries(db, TODAY);
    const pending = await listPendingEntries(db);

    await confirmPendingEntry(db, pending[0].id); // the rule's own amount
    await confirmPendingEntry(db, pending[1].id, {
      amount: 520_000,
      note: "Kos naik",
    });
    await skipPendingEntry(db, pending[2].id);

    const entries = await listEntries(db, { limit: 10 });
    expect(entries.map((e) => [e.occurredOn, e.amount, e.note])).toEqual([
      ["2026-08-01", 520_000, "Kos naik"],
      ["2026-07-01", 500_000, "Kos"],
    ]);
    expect(entries.every((e) => e.recurringRuleId !== null)).toBe(true);
    expect((await balances(db)).Cash).toBe(5_000_000 - 500_000 - 520_000); // the skipped one changed nothing
    expect(await countPendingEntries(db)).toBe(0);

    // A confirmed or skipped occurrence never comes back.
    expect(await generatePendingEntries(db, TODAY)).toBe(0);
  });

  it("confirms a transfer rule into a transfer, fee and all", async () => {
    await createRule(
      db,
      rule({
        type: "transfer",
        amount: 1_000_000,
        categoryId: null,
        toAccountId: bca,
        fee: 6_500,
        frequency: "monthly",
        startDate: "2026-09-01",
      }),
    );
    await generatePendingEntries(db, TODAY);
    const [pending] = await listPendingEntries(db);
    await confirmPendingEntry(db, pending.id);

    const [transfer] = await listTransfers(db, { limit: 5 });
    expect(transfer).toMatchObject({
      occurredOn: "2026-09-01",
      amount: 1_000_000,
      fee: 6_500,
      fromAccountName: "Cash",
    });
    expect(await balances(db)).toEqual({
      Cash: 5_000_000 - 1_006_500,
      BCA: 10_000_000,
    });
    // Only the fee counts as spending (FR-5.5).
    expect(
      (await getPeriodTotals(db, getPeriodRange("month", TODAY), TODAY))
        .spending,
    ).toBe(6_500);
  });

  it("applies a change to future occurrences only (FR-11.7)", async () => {
    const id = await createRule(db, rule());
    await generatePendingEntries(db, TODAY);
    const pending = await listPendingEntries(db);
    await confirmPendingEntry(db, pending[0].id); // July at 500,000

    await updateRule(db, id, rule({ amount: 600_000 }));
    await generatePendingEntries(db, TODAY);

    const [july] = await listEntries(db, { limit: 10 });
    expect(july.amount).toBe(500_000); // the confirmed entry is untouched
    const waiting = await listPendingEntries(db);
    expect(waiting.map((p) => p.dueDate)).toEqual(["2026-08-01", "2026-09-01"]);
    expect(waiting[0].rule.amount).toBe(600_000); // occurrences still waiting use the new amount
  });

  it("stops generating once archived, and keeps confirmed history", async () => {
    const id = await createRule(db, rule());
    await generatePendingEntries(db, TODAY);
    await confirmPendingEntry(db, (await listPendingEntries(db))[0].id);

    await setRuleArchived(db, id, true);
    expect(await countPendingEntries(db)).toBe(0);
    expect(await generatePendingEntries(db, TODAY)).toBe(0);
    expect(await listEntries(db, { limit: 10 })).toHaveLength(1);
  });

  it("rejects rules that make no sense", () => {
    expect(() => validateRule(rule({ amount: 0 }))).toThrow("invalid_amount");
    expect(() => validateRule(rule({ endDate: "2026-06-01" }))).toThrow(
      "end_before_start",
    );
    expect(() => validateRule(rule({ categoryId: null }))).toThrow(
      "choose_category",
    );
    expect(() =>
      validateRule(
        rule({ type: "transfer", categoryId: null, toAccountId: null }),
      ),
    ).toThrow("choose_accounts");
    expect(() =>
      validateRule(
        rule({ type: "transfer", categoryId: null, toAccountId: cash }),
      ),
    ).toThrow("same_account");
  });
});

describeDb("savings goals (FR-12)", () => {
  let db: SQLiteDatabase;
  let cash: number;
  let savings: number;

  beforeEach(async () => {
    db = await createTestDb();
    cash = await createAccount(db, {
      name: "Cash",
      type: "cash",
      openingBalance: 3_000_000,
      alertLine: null,
    });
    savings = await createAccount(db, {
      name: "Savings",
      type: "bank",
      openingBalance: 7_000_000,
      alertLine: null,
    });
  });

  it("measures a linked goal by its account's balance (FR-12.2)", async () => {
    await createGoal(db, {
      name: "Emergency fund",
      targetAmount: 20_000_000,
      targetDate: null,
      measure: "linked",
      linkedAccountId: savings,
    });
    const [goal] = await listGoals(db, TODAY);
    expect(goal).toMatchObject({
      saved: 7_000_000,
      linkedAccountName: "Savings",
    });
    expect(await getTotalInGoals(db, TODAY)).toBe(0); // a linked goal holds no money of its own
  });

  it("moves money in and out without changing the combined total (FR-12.3, FR-12.4, FR-12.7)", async () => {
    const goal = await createGoal(db, {
      name: "Umrah",
      targetAmount: 30_000_000,
      targetDate: null,
      measure: "manual",
      linkedAccountId: null,
    });
    const combined = async () =>
      (await listAccountsWithBalances(db, TODAY)).reduce(
        (s, a) => s + a.balance,
        0,
      ) + (await getTotalInGoals(db, TODAY));
    const before = await combined();

    await addMovement(
      db,
      {
        goalId: goal,
        accountId: cash,
        direction: "contribution",
        amount: 1_000_000,
        occurredOn: "2026-09-10",
        note: "Sisa gaji",
      },
      TODAY,
    );
    expect((await balances(db)).Cash).toBe(2_000_000);
    expect((await listGoals(db, TODAY))[0].saved).toBe(1_000_000);
    expect(await combined()).toBe(before);

    await addMovement(
      db,
      {
        goalId: goal,
        accountId: savings,
        direction: "release",
        amount: 250_000,
        occurredOn: TODAY,
        note: null,
      },
      TODAY,
    );
    expect((await balances(db)).Savings).toBe(7_250_000);
    expect((await listGoals(db, TODAY))[0].saved).toBe(750_000);
    expect(await combined()).toBe(before);
    expect(await listMovements(db, goal)).toHaveLength(2);
  });

  it("never counts movements as spending or income (FR-12.3)", async () => {
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
    expect(
      await getPeriodTotals(db, getPeriodRange("month", TODAY), TODAY),
    ).toEqual({ spending: 0, income: 0, net: 0 });
  });

  it("applies a future-dated contribution only once its date arrives", async () => {
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
        amount: 500_000,
        occurredOn: "2026-09-25",
        note: null,
      },
      TODAY,
    );
    expect((await balances(db)).Cash).toBe(3_000_000);
    expect((await listGoals(db, TODAY))[0].saved).toBe(0);
    expect((await balances(db, "2026-09-25")).Cash).toBe(2_500_000);
    expect((await listGoals(db, "2026-09-25"))[0].saved).toBe(500_000);
  });

  it("refuses releasing more than the goal holds, and movements on a linked goal", async () => {
    const manual = await createGoal(db, {
      name: "Umrah",
      targetAmount: 30_000_000,
      targetDate: null,
      measure: "manual",
      linkedAccountId: null,
    });
    await addMovement(
      db,
      {
        goalId: manual,
        accountId: cash,
        direction: "contribution",
        amount: 100_000,
        occurredOn: TODAY,
        note: null,
      },
      TODAY,
    );
    await expect(
      addMovement(
        db,
        {
          goalId: manual,
          accountId: cash,
          direction: "release",
          amount: 100_001,
          occurredOn: TODAY,
          note: null,
        },
        TODAY,
      ),
    ).rejects.toThrow("release_exceeds_goal");

    const linked = await createGoal(db, {
      name: "Fund",
      targetAmount: 1_000_000,
      targetDate: null,
      measure: "linked",
      linkedAccountId: savings,
    });
    await expect(
      addMovement(
        db,
        {
          goalId: linked,
          accountId: cash,
          direction: "contribution",
          amount: 1_000,
          occurredOn: TODAY,
          note: null,
        },
        TODAY,
      ),
    ).rejects.toThrow("goal_is_linked");
  });

  it("locks the measure once a goal holds money", async () => {
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
        amount: 100_000,
        occurredOn: TODAY,
        note: null,
      },
      TODAY,
    );
    await expect(
      updateGoal(db, goal, {
        name: "Umrah",
        targetAmount: 30_000_000,
        targetDate: null,
        measure: "linked",
        linkedAccountId: savings,
      }),
    ).rejects.toThrow("measure_locked");

    // Renaming and retargeting still work.
    await updateGoal(db, goal, {
      name: "Umrah 2027",
      targetAmount: 35_000_000,
      targetDate: "2027-06-30",
      measure: "manual",
      linkedAccountId: null,
    });
    expect((await listGoals(db, TODAY))[0]).toMatchObject({
      name: "Umrah 2027",
      targetAmount: 35_000_000,
      targetDate: "2027-06-30",
    });
  });
});
