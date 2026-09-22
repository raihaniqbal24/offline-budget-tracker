import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { colors, radius, spacing, typography } from "../theme";
import { useSettingsStore } from "../store/settingsStore";
import type { LanguageSetting } from "../types";

const LANGUAGE_OPTIONS: { value: LanguageSetting; labelKey: string }[] = [
  { value: "system", labelKey: "settings.languageSystem" },
  { value: "en", labelKey: "settings.languageEn" },
  { value: "id", labelKey: "settings.languageId" },
];

export default function SettingsScreen() {
  const { t } = useTranslation();
  const language = useSettingsStore((s) => s.language);
  const schemaVersion = useSettingsStore((s) => s.schemaVersion);
  const setLanguage = useSettingsStore((s) => s.setLanguage);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={[typography.label, styles.sectionTitle]}>
        {t("settings.language")}
      </Text>
      <View style={styles.group} accessibilityRole="radiogroup">
        {LANGUAGE_OPTIONS.map((option, index) => {
          const selected = option.value === language;
          return (
            <Pressable
              key={option.value}
              style={({ pressed }) => [
                styles.row,
                index > 0 && styles.rowDivider,
                pressed && styles.rowPressed,
              ]}
              onPress={() => setLanguage(option.value)}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
            >
              <Text style={[typography.body, styles.rowLabel]}>
                {t(option.labelKey)}
              </Text>
              {selected && (
                <MaterialCommunityIcons
                  name="check"
                  size={22}
                  color={colors.primary}
                />
              )}
            </Pressable>
          );
        })}
      </View>

      <Text style={[typography.label, styles.sectionTitle]}>
        {t("settings.data")}
      </Text>
      <View style={styles.group}>
        <View style={styles.row}>
          <Text style={[typography.body, styles.rowLabel]}>
            {t("settings.schemaVersion")}
          </Text>
          <Text style={typography.amount}>{schemaVersion}</Text>
        </View>
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
    gap: spacing.sm,
  },
  sectionTitle: {
    marginTop: spacing.md,
    marginLeft: spacing.xs,
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
    paddingHorizontal: spacing.md,
    minHeight: 52,
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
