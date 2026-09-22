import type { NavigatorScreenParams } from "@react-navigation/native";
import type { BudgetScope, CategoryType } from "../types";

export type TabParamList = {
  Home: undefined;
  Entries: undefined;
  Summary: undefined;
  Accounts: undefined;
  More: undefined;
};

/** Full-screen pages opened on top of the tabs. */
export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  Settings: undefined;
  EntryForm: { entryId?: number; type?: "expense" | "income" } | undefined;
  AccountForm: { accountId?: number } | undefined;
  TransferForm: { transferId?: number; fromAccountId?: number } | undefined;
  Transfers: undefined;
  Reconcile: { accountId: number };
  Adjustment: { entryId: number };
  /** Unrecorded adjustments dated within start..end, optionally for one account. */
  Adjustments: { start: string; end: string; accountId?: number | null };
  Categories: undefined;
  CategoryForm: { categoryId?: number; type?: CategoryType } | undefined;
  Budgets: undefined;
  BudgetForm: { scope: BudgetScope; categoryId?: number; accountId?: number };
  Search: undefined;
};
