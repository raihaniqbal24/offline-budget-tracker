import type { ComponentProps } from "react";
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
import type { RootStackParamList, TabParamList } from "./types";
import PlaceholderScreen from "../screens/PlaceholderScreen";
import MoreScreen from "../screens/MoreScreen";
import SettingsScreen from "../screens/SettingsScreen";

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

// Placeholders are replaced phase by phase.
const HomeScreen = () => <PlaceholderScreen phase={1} />;
const EntriesScreen = () => <PlaceholderScreen phase={1} />;
const SummaryScreen = () => <PlaceholderScreen phase={2} />;
const AccountsScreen = () => <PlaceholderScreen phase={1} />;

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

export default function AppNavigator() {
  const { t } = useTranslation();
  return (
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
      </Stack.Navigator>
    </NavigationContainer>
  );
}
