import type { NavigatorScreenParams } from "@react-navigation/native";

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
};
