import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { formatRupiah, type AppLanguage } from "../lib/money";
import { budgetColor, colors, spacing, typography } from "../theme";

interface Props {
  label: string;
  spent: number;
  limit: number;
  percent: number;
  lang: AppLanguage;
  onPress?: () => void;
}

/** One limit's progress (FR-7.4), colored at 75%, 90% and 100%. */
export default function BudgetBar({ label, spent, limit, percent, lang, onPress }: Props) {
  const { t } = useTranslation();
  const color = budgetColor(percent);
  const remaining = limit - spent;

  const body = (
    <>
      <View style={styles.header}>
        <Text style={[typography.body, styles.label]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[typography.label, { color: percent >= 75 ? color : colors.textMuted }]}>{percent}%</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.min(percent, 100)}%`, backgroundColor: color }]} />
      </View>
      <Text style={typography.caption}>
        {remaining >= 0
          ? t("budgets.leftOf", { spent: formatRupiah(spent, lang), limit: formatRupiah(limit, lang), left: formatRupiah(remaining, lang) })
          : t("budgets.overBy", { spent: formatRupiah(spent, lang), limit: formatRupiah(limit, lang), over: formatRupiah(-remaining, lang) })}
      </Text>
    </>
  );

  return onPress ? (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.wrapper, pressed && styles.pressed]} accessibilityRole="button">
      {body}
    </Pressable>
  ) : (
    <View style={styles.wrapper}>{body}</View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.xs, paddingVertical: spacing.xs },
  pressed: { opacity: 0.7 },
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  label: { flex: 1 },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.background, overflow: "hidden" },
  fill: { height: 8, borderRadius: 4 },
});
