import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useTranslation } from "react-i18next";
import { getDb } from "../db/client";
import { listAccountsWithBalances } from "../db/accountsDao";
import { useAppLanguage } from "../i18n/useAppLanguage";
import { today } from "../lib/dates";
import { formatDate } from "../lib/dateLabels";
import { formatRupiah, parseAmount } from "../lib/money";
import { useLedgerStore } from "../store/ledgerStore";
import { radius, spacing } from "../theme";
import { makeStyles, useTheme } from "../theme/ThemeProvider";
import type { RootStackParamList } from "../navigation/types";
import AmountInput from "../components/AmountInput";
import Button from "../components/Button";
import KeyboardAvoider from "../components/KeyboardAvoider";
import DateField from "../components/DateField";

type Props = NativeStackScreenProps<RootStackParamList, "Reconcile">;

/**
 * FR-1.4: enter the account's real balance on the day you checked it. The
 * difference from the app's balance on that day is recorded as an
 * Unrecorded adjustment dated that day, then opened so it can be explained.
 */
export default function ReconcileScreen({ route, navigation }: Props) {
  const { colors, typography } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const lang = useAppLanguage();
  const account = useLedgerStore((s) =>
    s.accounts.find((a) => a.id === route.params.accountId),
  );
  const reconcile = useLedgerStore((s) => s.reconcile);

  const todayDate = today();
  const [onDate, setOnDate] = useState(todayDate);
  const [appBalance, setAppBalance] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [negative, setNegative] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The app's balance as of the chosen day.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const rows = await listAccountsWithBalances(await getDb(), onDate);
      const balance =
        rows.find((a) => a.id === route.params.accountId)?.balance ?? null;
      if (!cancelled) setAppBalance(balance);
    })();
    return () => {
      cancelled = true;
    };
  }, [onDate, route.params.accountId]);

  if (!account) return null;

  const parsed = parseAmount(text);
  const real = parsed === null ? null : negative ? -parsed : parsed;
  const difference =
    real === null || appBalance === null ? null : real - appBalance;
  const isFuture = onDate > todayDate;

  const save = async () => {
    if (isFuture) return setError(t("reconcile.noFuture"));
    if (real === null) return setError(t("amount.invalid"));
    setError(null);
    setSaving(true);
    try {
      const adjustmentId = await reconcile(account.id, real, onDate);
      if (adjustmentId === null) navigation.goBack();
      else navigation.replace("Adjustment", { entryId: adjustmentId });
    } catch (e) {
      setError(
        t("errors.saveFailed", { message: String((e as Error).message ?? e) }),
      );
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoider style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={typography.label}>{t("reconcile.checkedOn")}</Text>
        <DateField
          value={onDate}
          onChange={setOnDate}
          lang={lang}
          todayDate={todayDate}
        />
        {isFuture ? (
          <Text style={styles.error}>{t("reconcile.noFuture")}</Text>
        ) : null}

        <View style={[styles.card, styles.label]}>
          <Text style={typography.label}>
            {onDate === todayDate
              ? t("reconcile.appBalance")
              : t("reconcile.appBalanceOn", {
                  date: formatDate(onDate, lang, { todayDate }),
                })}
          </Text>
          {appBalance === null ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Text style={[typography.title, styles.amount]}>
              {formatRupiah(appBalance, lang)}
            </Text>
          )}
          <Text style={typography.caption}>{account.name}</Text>
        </View>

        <Text style={[typography.label, styles.label]}>
          {t("reconcile.realBalance")}
        </Text>
        <AmountInput
          value={text}
          onChangeText={setText}
          lang={lang}
          autoFocus
          large
          negative={negative}
          onToggleNegative={() => setNegative((v) => !v)}
          error={error && !isFuture ? error : null}
        />
        <Text style={typography.caption}>{t("reconcile.realBalanceHint")}</Text>

        {difference !== null && !isFuture ? (
          <View style={styles.result}>
            <Text
              style={[
                typography.body,
                {
                  color:
                    difference < 0
                      ? colors.expense
                      : difference > 0
                        ? colors.income
                        : colors.text,
                },
              ]}
            >
              {difference === 0
                ? t("reconcile.matches")
                : difference < 0
                  ? t("reconcile.unrecordedSpending", {
                      amount: formatRupiah(-difference, lang),
                    })
                  : t("reconcile.unrecordedIncome", {
                      amount: formatRupiah(difference, lang),
                    })}
            </Text>
            {difference !== 0 ? (
              <Text style={typography.caption}>
                {t("reconcile.datedOn", {
                  date: formatDate(onDate, lang, { todayDate }),
                })}
              </Text>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label={difference === 0 ? t("common.done") : t("reconcile.save")}
          onPress={save}
          loading={saving}
          disabled={isFuture || appBalance === null}
        />
      </View>
    </KeyboardAvoider>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.background },
  content: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
  card: {
    padding: spacing.md,
    gap: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: c.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
  },
  amount: { fontVariant: ["tabular-nums"] },
  label: { marginTop: spacing.md },
  result: { marginTop: spacing.md, gap: spacing.xs },
  error: { fontSize: 13, color: c.expense },
  footer: {
    padding: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.border,
    backgroundColor: c.surface,
  },
}));
