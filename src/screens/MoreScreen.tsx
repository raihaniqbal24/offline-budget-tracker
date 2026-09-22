import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { colors, radius, spacing, typography } from "../theme";
import type { RootStackParamList } from "../navigation/types";

/**
 * Hub for everything that isn't a daily screen. Later phases add rows for
 * transfers, categories, budgets, goals, recurring rules and backup.
 */
export default function MoreScreen() {
  const { t } = useTranslation();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.group}>
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => navigation.navigate("Settings")}
          accessibilityRole="button"
        >
          <MaterialCommunityIcons
            name="cog-outline"
            size={22}
            color={colors.primary}
          />
          <Text style={[typography.body, styles.rowLabel]}>
            {t("more.settings")}
          </Text>
          <MaterialCommunityIcons
            name="chevron-right"
            size={22}
            color={colors.textMuted}
          />
        </Pressable>
      </View>
    </ScrollView>
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
  rowPressed: {
    backgroundColor: colors.primarySoft,
  },
  rowLabel: {
    flex: 1,
  },
});
