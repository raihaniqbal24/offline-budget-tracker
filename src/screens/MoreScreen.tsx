import type { ComponentProps } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { radius, spacing } from "../theme";
import { makeStyles, useTheme } from "../theme/ThemeProvider";
import type { RootStackParamList } from "../navigation/types";

/**
 * Hub for everything that isn't a daily screen.
 */
export default function MoreScreen() {
  const styles = useStyles();
  const { t } = useTranslation();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.group}>
        <Row
          icon="bank-transfer"
          label={t("more.transfers")}
          onPress={() => navigation.navigate("Transfers")}
        />
        <Row
          icon="chart-box-outline"
          label={t("more.budgets")}
          onPress={() => navigation.navigate("Budgets")}
          divider
        />
        <Row
          icon="calendar-sync-outline"
          label={t("more.recurring")}
          onPress={() => navigation.navigate("Recurring")}
          divider
        />
        <Row
          icon="piggy-bank-outline"
          label={t("more.goals")}
          onPress={() => navigation.navigate("Goals")}
          divider
        />
        <Row
          icon="tag-outline"
          label={t("more.categories")}
          onPress={() => navigation.navigate("Categories")}
          divider
        />
        <Row
          icon="magnify"
          label={t("more.search")}
          onPress={() => navigation.navigate("Search")}
          divider
        />
        <Row
          icon="cog-outline"
          label={t("more.settings")}
          onPress={() => navigation.navigate("Settings")}
          divider
        />
      </View>
    </ScrollView>
  );
}

function Row({
  icon,
  label,
  onPress,
  divider,
}: {
  icon: ComponentProps<typeof MaterialCommunityIcons>["name"];
  label: string;
  onPress: () => void;
  divider?: boolean;
}) {
  const { colors, typography } = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        divider && styles.rowDivider,
        pressed && styles.rowPressed,
      ]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <MaterialCommunityIcons name={icon} size={22} color={colors.primary} />
      <Text style={[typography.body, styles.rowLabel]}>{label}</Text>
      <MaterialCommunityIcons
        name="chevron-right"
        size={22}
        color={colors.textMuted}
      />
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.background },
  content: { padding: spacing.md },
  group: {
    backgroundColor: c.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    minHeight: 56,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.border,
  },
  rowPressed: { backgroundColor: c.primarySoft },
  rowLabel: { flex: 1 },
}));
