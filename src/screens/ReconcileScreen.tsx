import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useTranslation } from "react-i18next";
import { useAppLanguage } from "../i18n/useAppLanguage";
import { formatNumber, formatRupiah, parseAmount } from "../lib/money";
import { useLedgerStore } from "../store/ledgerStore";
import { colors, radius, spacing, typography } from "../theme";
import type { RootStackParamList } from "../navigation/types";
import AmountInput from "../components/AmountInput";
import Button from "../components/Button";

type Props = NativeStackScreenProps<RootStackParamList, "Reconcile">;

/**
 * FR-1.4: enter the account's real balance; the difference is recorded as an
 * Unrecorded adjustment dated today, then opened so it can be explained.
 */
export default function ReconcileScreen({ route, navigation }: Props) {
  const { t } = useTranslation();
  const lang = useAppLanguage();
  const account = useLedgerStore((s) => s.accounts.find((a) => a.id === route.params.accountId));
  const reconcile = useLedgerStore((s) => s.reconcile);

  const [text, setText] = useState(account ? formatNumber(Math.abs(account.balance), lang) : "");
  const [negative, setNegative] = useState((account?.balance ?? 0) < 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = parseAmount(text);
  const real = parsed === null ? null : negative ? -parsed : parsed;
  const difference = useMemo(
    () => (real === null || !account ? null : real - account.balance),
    [real, account]
  );

  if (!account) return null;

  const save = async () => {
    if (real === null) return setError(t("amount.invalid"));
    setError(null);
    setSaving(true);
    try {
      const adjustmentId = await reconcile(account.id, real);
      if (adjustmentId === null) navigation.goBack();
      else navigation.replace("Adjustment", { entryId: adjustmentId });
    } catch (e) {
      setError(t("errors.saveFailed", { message: String((e as Error).message ?? e) }));
      setSaving(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={typography.label}>{t("reconcile.appBalance")}</Text>
          <Text style={[typography.title, styles.amount]}>{formatRupiah(account.balance, lang)}</Text>
          <Text style={typography.caption}>{account.name}</Text>
        </View>

        <Text style={[typography.label, styles.label]}>{t("reconcile.realBalance")}</Text>
        <AmountInput
          value={text}
          onChangeText={setText}
          lang={lang}
          autoFocus
          large
          negative={negative}
          onToggleNegative={() => setNegative((v) => !v)}
          error={error}
        />
        <Text style={typography.caption}>{t("reconcile.realBalanceHint")}</Text>

        {difference !== null ? (
          <View style={styles.result}>
            <Text
              style={[
                typography.body,
                { color: difference < 0 ? colors.expense : difference > 0 ? colors.income : colors.text },
              ]}
            >
              {difference === 0
                ? t("reconcile.matches")
                : difference < 0
                  ? t("reconcile.unrecordedSpending", { amount: formatRupiah(-difference, lang) })
                  : t("reconcile.unrecordedIncome", { amount: formatRupiah(difference, lang) })}
            </Text>
            {difference !== 0 ? <Text style={typography.caption}>{t("reconcile.datedToday")}</Text> : null}
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label={difference === 0 ? t("common.done") : t("reconcile.save")}
          onPress={save}
          loading={saving}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
  card: {
    padding: spacing.md,
    gap: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  amount: { fontVariant: ["tabular-nums"] },
  label: { marginTop: spacing.md },
  result: { marginTop: spacing.md, gap: spacing.xs },
  footer: {
    padding: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
});
