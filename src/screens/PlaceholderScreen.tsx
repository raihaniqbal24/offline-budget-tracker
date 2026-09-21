import { StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { colors, spacing, typography } from "../theme";

export default function PlaceholderScreen({ phase }: { phase: number }) {
  const { t } = useTranslation();
  return (
    <View style={styles.container}>
      <Text style={typography.label}>
        {t("placeholder.comingSoon", { phase })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    backgroundColor: colors.background,
  },
});
