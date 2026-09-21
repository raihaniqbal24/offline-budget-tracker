import type { NavigatorScreenParams } from "@react-navigation/native";

export type TabParamList = {
  Home: undefined;
  Entries: undefined;
  Summary: undefined;
  Accounts: undefined;
  More: undefined;
};

/** Full-screen pages opened on top of the tabs. Later phases add forms here. */
export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList>;
  Settings: undefined;
};
