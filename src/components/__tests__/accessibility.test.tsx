import { render, screen } from "@testing-library/react-native";
import { initI18n } from "../../i18n";
import BudgetBar from "../BudgetBar";
import EntryRow from "../EntryRow";
import TransferRow from "../TransferRow";
import type { EntryWithDetails } from "../../db/entriesDao";
import type { TransferWithDetails } from "../../db/transfersDao";

/**
 * Screen readers should hear one sentence per row, not a pile of fragments,
 * and progress bars should report their value (accessibility scope for this
 * release).
 */

const entry: EntryWithDetails = {
  id: 1,
  uid: "u1",
  type: "expense",
  amount: 25_000,
  currencyCode: "IDR",
  accountId: 1,
  categoryId: 1,
  occurredOn: "2026-09-21",
  note: "Kopi",
  recurringRuleId: null,
  createdAt: "2026-09-21T00:00:00.000Z",
  categoryName: "Food",
  categoryI18nKey: null,
  categoryIcon: "food",
  categoryColor: "#D9822B",
  categoryBuiltinKey: null,
  accountName: "Cash",
};

const transfer: TransferWithDetails = {
  id: 1,
  uid: "t1",
  fromAccountId: 1,
  toAccountId: 2,
  amount: 200_000,
  fee: 6_500,
  feePaidBy: "sender",
  currencyCode: "IDR",
  occurredOn: "2026-09-21",
  note: null,
  recurringRuleId: null,
  createdAt: "2026-09-21T00:00:00.000Z",
  fromAccountName: "BCA",
  toAccountName: "Cash",
};

beforeAll(async () => {
  await initI18n("en");
});

describe("accessibility", () => {
  it("reads an entry row as one sentence", async () => {
    await render(
      <EntryRow
        entry={entry}
        lang="en"
        isUpcoming={false}
        onPress={() => {}}
      />,
    );
    expect(screen.getByLabelText("Food, -Rp 25,000, Cash, Kopi")).toBeTruthy();
  });

  it("says when an entry is still upcoming", async () => {
    await render(
      <EntryRow
        entry={{ ...entry, note: null }}
        lang="en"
        isUpcoming
        onPress={() => {}}
      />,
    );
    expect(
      screen.getByLabelText("Food, -Rp 25,000, Cash, Upcoming"),
    ).toBeTruthy();
  });

  it("reads a transfer row with its fee", async () => {
    await render(
      <TransferRow
        transfer={transfer}
        lang="en"
        isUpcoming={false}
        onPress={() => {}}
      />,
    );
    expect(
      screen.getByLabelText("BCA → Cash, Rp 200,000, Fee Rp 6,500 · sender"),
    ).toBeTruthy();
  });

  it("reports budget progress as a progress bar with a value", async () => {
    await render(
      <BudgetBar
        label="Food"
        spent={750_000}
        limit={1_000_000}
        percent={75}
        lang="en"
      />,
    );
    const bar = screen.getByRole("progressbar");
    expect(bar.props.accessibilityValue).toMatchObject({
      min: 0,
      max: 100,
      now: 75,
      text: "Food, 75%, Rp 750,000 of Rp 1,000,000 · Rp 250,000 left",
    });
  });

  it("caps the progress bar's value when a limit is passed", async () => {
    await render(
      <BudgetBar
        label="Food"
        spent={1_200_000}
        limit={1_000_000}
        percent={120}
        lang="en"
      />,
    );
    expect(screen.getByRole("progressbar").props.accessibilityValue.now).toBe(
      100,
    );
  });
});
