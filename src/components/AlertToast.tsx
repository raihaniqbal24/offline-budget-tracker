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
 * In-app message after a save: a budget level reached (FR-7.5) or an account
 * that dropped to its alert line (FR-10.3). These always show, whether or not
 * phone notifications are allowed. Sits at the top so it never covers the
 * undo bar; tap to dismiss, or it goes after a few seconds.
 */
export default function AlertToast() {
  const { t } = useTranslation();
  const lang = useAppLanguage();
  const insets = useSafeAreaInsets();
  const alert = useLedgerStore((s) => s.alerts[0]);
  const accounts = useLedgerStore((s) => s.accounts);
  const categories = useLedgerStore((s) => s.categories);
  const dismiss = useLedgerStore((s) => s.dismissAlert);

  useEffect(() => {
    if (!alert) return;
    const timer = setTimeout(dismiss, SHOW_MS);
    return () => clearTimeout(timer);
  }, [alert, dismiss]);

  if (!alert) return null;

  let message: string;
  let accent: string;
  let icon: "alert" | "alert-octagon" | "alert-circle";

  if (alert.kind === "budget") {
    const { budget } = alert;
    const values = {
      name: budgetLabel(budget, accounts, categories, t),
      percent: budget.percent,
      spent: formatRupiah(budget.spent, lang),
      limit: formatRupiah(budget.limit, lang),
    };
    message = budget.level === 100 ? t("budgets.alertReached", values) : t("budgets.alertLevel", values);
    accent = budgetColor(budget.percent);
    icon = budget.level === 100 ? "alert-octagon" : "alert";
  } else {
    const { account } = alert;
    message = t("notifications.balanceBody", {
      name: account.name,
      balance: formatRupiah(account.balance, lang),
      line: formatRupiah(account.alertLine ?? 0, lang),
    });
    accent = colors.alert;
    icon = "alert-circle";
  }

  return (
    <Pressable
      onPress={dismiss}
      style={[styles.toast, { top: insets.top + spacing.sm, borderLeftColor: accent }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
    >
      <MaterialCommunityIcons name={icon} size={22} color={accent} />
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
