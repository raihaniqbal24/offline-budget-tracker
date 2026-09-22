import type { ComponentProps } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { colors, radius, spacing, typography } from "../theme";
import type { RootStackParamList } from "../navigation/types";

/**
 * Hub for everything that isn't a daily screen. Later phases add rows for
 * categories, budgets, goals, recurring rules and backup.
 */
export default function MoreScreen() {
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
  return (
    <Pressable
      style={({ pressed }) => [styles.row, divider && styles.rowDivider, pressed && styles.rowPressed]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <MaterialCommunityIcons name={icon} size={22} color={colors.primary} />
      <Text style={[typography.body, styles.rowLabel]}>{label}</Text>
      <MaterialCommunityIcons name="chevron-right" size={22} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.md,
  },
  group: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
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
    borderTopColor: colors.border,
  },
  rowPressed: {
    backgroundColor: colors.primarySoft,
  },
  rowLabel: {
    flex: 1,
  },
});
