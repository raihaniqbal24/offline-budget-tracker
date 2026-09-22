import { useEffect, type ComponentProps } from "react";
import { AppState, StyleSheet, View } from "react-native";
import {
  DefaultTheme,
  NavigationContainer,
  type Theme,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { colors } from "../theme";
import { useLedgerStore } from "../store/ledgerStore";
import type { RootStackParamList, TabParamList } from "./types";
import HomeScreen from "../screens/HomeScreen";
import EntriesScreen from "../screens/EntriesScreen";
import AccountsScreen from "../screens/AccountsScreen";
import MoreScreen from "../screens/MoreScreen";
import SettingsScreen from "../screens/SettingsScreen";
import EntryFormScreen from "../screens/EntryFormScreen";
import AccountFormScreen from "../screens/AccountFormScreen";
import SummaryScreen from "../screens/SummaryScreen";
import TransferFormScreen from "../screens/TransferFormScreen";
import TransfersScreen from "../screens/TransfersScreen";
import ReconcileScreen from "../screens/ReconcileScreen";
import AdjustmentScreen from "../screens/AdjustmentScreen";
import AdjustmentsScreen from "../screens/AdjustmentsScreen";
import CategoriesScreen from "../screens/CategoriesScreen";
import CategoryFormScreen from "../screens/CategoryFormScreen";
import BudgetsScreen from "../screens/BudgetsScreen";
import BudgetFormScreen from "../screens/BudgetFormScreen";
import SearchScreen from "../screens/SearchScreen";
import UndoSnackbar from "../components/UndoSnackbar";
import BudgetToast from "../components/BudgetToast";

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

const TAB_ICONS: Record<keyof TabParamList, IconName> = {
  Home: "home-variant-outline",
  Entries: "format-list-bulleted",
  Summary: "chart-donut",
  Accounts: "wallet-outline",
  More: "dots-horizontal-circle-outline",
};

const navTheme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.primary,
    background: colors.background,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
  },
};

function Tabs() {
  const { t } = useTranslation();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarIcon: ({ color, size }) => (
          <MaterialCommunityIcons
            name={TAB_ICONS[route.name]}
            color={color}
            size={size}
          />
        ),
      })}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ title: t("tabs.home") }}
      />
      <Tab.Screen
        name="Entries"
        component={EntriesScreen}
        options={{ title: t("tabs.entries") }}
      />
      <Tab.Screen
        name="Summary"
        component={SummaryScreen}
        options={{ title: t("tabs.summary") }}
      />
      <Tab.Screen
        name="Accounts"
        component={AccountsScreen}
        options={{ title: t("tabs.accounts") }}
      />
      <Tab.Screen
        name="More"
        component={MoreScreen}
        options={{ title: t("tabs.more") }}
      />
    </Tab.Navigator>
  );
}

/**
 * Recalculate balances whenever the app comes back to the foreground, so a
 * future-dated entry takes effect on its date without a restart (FR-2.3).
 */
function useRefreshOnForeground() {
  const refresh = useLedgerStore((s) => s.refresh);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    return () => sub.remove();
  }, [refresh]);
}

export default function AppNavigator() {
  const { t } = useTranslation();
  useRefreshOnForeground();

  return (
    <View style={styles.root}>
      <NavigationContainer theme={navTheme}>
        <Stack.Navigator>
          <Stack.Screen
            name="Tabs"
            component={Tabs}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="Settings"
            component={SettingsScreen}
            options={{ title: t("settings.title") }}
          />
          <Stack.Screen
            name="EntryForm"
            component={EntryFormScreen}
            options={({ route }) => ({
              title: route.params?.entryId
                ? t("entryForm.titleEdit")
                : t("entryForm.titleNew"),
            })}
          />
          <Stack.Screen
            name="AccountForm"
            component={AccountFormScreen}
            options={({ route }) => ({
              title: route.params?.accountId
                ? t("accountForm.titleEdit")
                : t("accountForm.titleNew"),
            })}
          />
          <Stack.Screen
            name="TransferForm"
            component={TransferFormScreen}
            options={({ route }) => ({
              title: route.params?.transferId ? t("transfers.edit") : t("transfers.new"),
            })}
          />
          <Stack.Screen
            name="Transfers"
            component={TransfersScreen}
            options={{ title: t("transfers.title") }}
          />
          <Stack.Screen
            name="Reconcile"
            component={ReconcileScreen}
            options={{ title: t("reconcile.title") }}
          />
          <Stack.Screen
            name="Adjustment"
            component={AdjustmentScreen}
            options={{ title: t("adjustment.title") }}
          />
          <Stack.Screen
            name="Adjustments"
            component={AdjustmentsScreen}
            options={{ title: t("adjustment.listTitle") }}
          />
          <Stack.Screen
            name="Categories"
            component={CategoriesScreen}
            options={{ title: t("categories.title") }}
          />
          <Stack.Screen
            name="CategoryForm"
            component={CategoryFormScreen}
            options={({ route }) => ({
              title: route.params?.categoryId
                ? t("categories.edit")
                : t("categories.new"),
            })}
          />
          <Stack.Screen
            name="Budgets"
            component={BudgetsScreen}
            options={{ title: t("budgets.title") }}
          />
          <Stack.Screen
            name="BudgetForm"
            component={BudgetFormScreen}
            options={{ title: t("budgets.monthlyLimit") }}
          />
          <Stack.Screen
            name="Search"
            component={SearchScreen}
            options={{ title: t("search.title") }}
          />
        </Stack.Navigator>
      </NavigationContainer>
      <UndoSnackbar />
      <BudgetToast />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
