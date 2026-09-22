import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAppLanguage } from "../i18n/useAppLanguage";
import { formatRupiah } from "../lib/money";
import { useLedgerStore } from "../store/ledgerStore";
import { budgetColor, colors, radius, spacing } from "../theme";
import { budgetLabel } from "./budgetLabel";

const SHOW_MS = 6_000;

/**
 * In-app budget warning (FR-7.5, decided: a message after saving). Shows the
 * next newly reached level; tap to dismiss, or it goes after a few seconds.
 * Sits at the top so it never covers the undo bar.
 */
export default function BudgetToast() {
  const { t } = useTranslation();
  const lang = useAppLanguage();
  const insets = useSafeAreaInsets();
  const alert = useLedgerStore((s) => s.budgetAlerts[0]);
  const accounts = useLedgerStore((s) => s.accounts);
  const categories = useLedgerStore((s) => s.categories);
  const dismiss = useLedgerStore((s) => s.dismissBudgetAlert);

  useEffect(() => {
    if (!alert) return;
    const timer = setTimeout(dismiss, SHOW_MS);
    return () => clearTimeout(timer);
  }, [alert, dismiss]);

  if (!alert) return null;

  const name = budgetLabel(alert, accounts, categories, t);
  const values = {
    name,
    percent: alert.percent,
    spent: formatRupiah(alert.spent, lang),
    limit: formatRupiah(alert.limit, lang),
  };
  const message = alert.level === 100 ? t("budgets.alertReached", values) : t("budgets.alertLevel", values);

  return (
    <Pressable
      onPress={dismiss}
      style={[styles.toast, { top: insets.top + spacing.sm, borderLeftColor: budgetColor(alert.percent) }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
    >
      <MaterialCommunityIcons
        name={alert.level === 100 ? "alert-octagon" : "alert"}
        size={22}
        color={budgetColor(alert.percent)}
      />
      <View style={styles.body}>
        <Text style={styles.text}>{message}</Text>
      </View>
      <MaterialCommunityIcons name="close" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: "absolute",
    left: spacing.md,
    right: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderLeftWidth: 5,
    backgroundColor: colors.surface,
    elevation: 8,
  },
  body: { flex: 1 },
  text: { fontSize: 15, color: colors.text },
});
