import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useTranslation } from "react-i18next";
import { getDb } from "../db/client";
import { getBudgetProgress, targetKey, type BudgetProgress, type BudgetTarget } from "../db/budgetsDao";
import { useAppLanguage } from "../i18n/useAppLanguage";
import { monthKey, today } from "../lib/dates";
import { formatMonthYear } from "../lib/dateLabels";
import { formatNumber, isValidEntryAmount, parseAmount } from "../lib/money";
import { useLedgerStore } from "../store/ledgerStore";
import { colors, radius, spacing, typography } from "../theme";
import type { RootStackParamList } from "../navigation/types";
import AmountInput from "../components/AmountInput";
import BudgetBar from "../components/BudgetBar";
import Button from "../components/Button";
import { budgetLabel } from "../components/budgetLabel";

type Props = NativeStackScreenProps<RootStackParamList, "BudgetForm">;

/** Set, change or remove one monthly limit from this month on (FR-7.1, FR-7.2). */
export default function BudgetFormScreen({ route, navigation }: Props) {
  const { t } = useTranslation();
  const lang = useAppLanguage();
  const accounts = useLedgerStore((s) => s.accounts);
  const categories = useLedgerStore((s) => s.categories);
  const setBudget = useLedgerStore((s) => s.setBudget);

  const target = useMemo<BudgetTarget>(
    () => ({
      scope: route.params.scope,
      categoryId: route.params.categoryId ?? null,
      accountId: route.params.accountId ?? null,
    }),
    [route.params]
  );
  const todayDate = today();
  const month = monthKey(todayDate);

  const [current, setCurrent] = useState<BudgetProgress | null | undefined>(undefined);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rows = await getBudgetProgress(await getDb(), month, todayDate);
      const found = rows.find((p) => targetKey(p) === targetKey(target)) ?? null;
      if (cancelled) return;
      setCurrent(found);
      if (found) setText(formatNumber(found.limit, lang));
    })();
    return () => {
      cancelled = true;
    };
    // lang is read once for the initial text only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, todayDate, target]);

  if (current === undefined) return <ActivityIndicator style={styles.loader} color={colors.primary} />;

  const label = budgetLabel(target, accounts, categories, t);

  const save = async () => {
    const amount = parseAmount(text);
    if (amount === null) return setError(t("amount.invalid"));
    if (!isValidEntryAmount(amount)) return setError(t("amount.mustBePositive"));
    setError(null);
    setSaving(true);
    await setBudget(target, amount);
    navigation.goBack();
  };

  const remove = async () => {
    setSaving(true);
    await setBudget(target, null);
    navigation.goBack();
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={typography.title}>{label}</Text>
        <Text style={typography.caption}>{t(`budgets.scopeHint.${target.scope}`)}</Text>

        {current ? (
          <View style={styles.card}>
            <BudgetBar label={t("budgets.thisMonth")} spent={current.spent} limit={current.limit} percent={current.percent} lang={lang} />
          </View>
        ) : null}

        <Text style={[typography.label, styles.label]}>{t("budgets.monthlyLimit")}</Text>
        <AmountInput value={text} onChangeText={setText} lang={lang} autoFocus={!current} large error={error} />
        <Text style={typography.caption}>
          {t("budgets.appliesFrom", { month: formatMonthYear(`${month}-01`, lang) })}
        </Text>

        {current ? (
          <Button label={t("budgets.remove")} variant="danger" onPress={remove} style={styles.remove} />
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <Button label={t("common.save")} onPress={save} loading={saving} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  loader: { marginTop: spacing.xl },
  content: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
  card: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  label: { marginTop: spacing.md },
  remove: { marginTop: spacing.xl },
  footer: {
    padding: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
});
