import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { getDb } from "../db/client";
import { getBudgetProgress, targetKey, type BudgetProgress, type BudgetTarget } from "../db/budgetsDao";
import { categoryLabel } from "../i18n";
import { useAppLanguage } from "../i18n/useAppLanguage";
import { monthKey, today } from "../lib/dates";
import { formatMonthYear } from "../lib/dateLabels";
import type { AppLanguage } from "../lib/money";
import { useLedgerStore } from "../store/ledgerStore";
import { colors, radius, spacing, typography } from "../theme";
import type { RootStackParamList } from "../navigation/types";
import BudgetBar from "../components/BudgetBar";

type Props = NativeStackScreenProps<RootStackParamList, "Budgets">;

/**
 * Monthly limits (FR-7.1): overall, per account and per expense category,
 * all usable together. Shows this month's progress; tap a row to set, change
 * or remove its limit from this month on.
 */
export default function BudgetsScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const lang = useAppLanguage();
  const accounts = useLedgerStore((s) => s.accounts);
  const categories = useLedgerStore((s) => s.categories);
  const dataVersion = useLedgerStore((s) => s.dataVersion);

  const todayDate = today();
  const month = monthKey(todayDate);
  const [progress, setProgress] = useState<Map<string, BudgetProgress> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rows = await getBudgetProgress(await getDb(), month, todayDate);
      if (!cancelled) setProgress(new Map(rows.map((p) => [targetKey(p), p])));
    })();
    return () => {
      cancelled = true;
    };
  }, [month, todayDate, dataVersion]);

  const activeAccounts = useMemo(() => accounts.filter((a) => !a.archived), [accounts]);
  const expenseCategories = useMemo(
    () => categories.filter((c) => c.type === "expense" && c.builtinKey === null && !c.archived),
    [categories]
  );

  if (progress === null) return <ActivityIndicator style={styles.loader} color={colors.primary} />;

  const open = (target: BudgetTarget) =>
    navigation.navigate("BudgetForm", {
      scope: target.scope,
      categoryId: target.categoryId ?? undefined,
      accountId: target.accountId ?? undefined,
    });

  const row = (target: BudgetTarget, label: string) => (
    <LimitRow
      key={targetKey(target)}
      label={label}
      progress={progress.get(targetKey(target))}
      lang={lang}
      onPress={() => open(target)}
    />
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={typography.title}>{formatMonthYear(`${month}-01`, lang)}</Text>
      <Text style={typography.caption}>{t("budgets.intro")}</Text>

      <Text style={[typography.label, styles.section]}>{t("budgets.overallSection")}</Text>
      <View style={styles.group}>{row({ scope: "overall", categoryId: null, accountId: null }, t("budgets.overall"))}</View>

      {activeAccounts.length > 0 ? (
        <>
          <Text style={[typography.label, styles.section]}>{t("budgets.accountsSection")}</Text>
          <View style={styles.group}>
            {activeAccounts.map((a) => row({ scope: "account", categoryId: null, accountId: a.id }, a.name))}
          </View>
        </>
      ) : null}

      <Text style={[typography.label, styles.section]}>{t("budgets.categoriesSection")}</Text>
      <View style={styles.group}>
        {expenseCategories.map((c) => row({ scope: "category", categoryId: c.id, accountId: null }, categoryLabel(c)))}
      </View>
    </ScrollView>
  );
}

function LimitRow({
  label,
  progress,
  lang,
  onPress,
}: {
  label: string;
  progress: BudgetProgress | undefined;
  lang: AppLanguage;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  if (progress) {
    return (
      <View style={styles.row}>
        <BudgetBar
          label={label}
          spent={progress.spent}
          limit={progress.limit}
          percent={progress.percent}
          lang={lang}
          onPress={onPress}
        />
      </View>
    );
  }
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, styles.emptyRow, pressed && styles.pressed]} accessibilityRole="button">
      <Text style={[typography.body, styles.flex]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={typography.label}>{t("budgets.noLimit")}</Text>
      <MaterialCommunityIcons name="chevron-right" size={20} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  loader: { marginTop: spacing.xl },
  content: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
  section: { marginTop: spacing.md },
  group: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: "hidden",
  },
  row: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  emptyRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 52 },
  pressed: { backgroundColor: colors.primarySoft },
  flex: { flex: 1 },
});
