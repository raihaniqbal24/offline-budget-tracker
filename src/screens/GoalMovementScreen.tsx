import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useTranslation } from "react-i18next";
import { getDb } from "../db/client";
import { getGoal, type GoalWithProgress } from "../db/goalsDao";
import { useAppLanguage } from "../i18n/useAppLanguage";
import { today } from "../lib/dates";
import { formatRupiah, isValidEntryAmount, parseAmount } from "../lib/money";
import {
  activeAccounts,
  defaultAccountId,
  useLedgerStore,
} from "../store/ledgerStore";
import { colors, radius, spacing, typography } from "../theme";
import type { ID } from "../types";
import type { RootStackParamList } from "../navigation/types";
import { ACCOUNT_TYPE_ICONS } from "../components/accountTypes";
import AmountInput from "../components/AmountInput";
import Button from "../components/Button";
import Chip from "../components/Chip";
import DateField from "../components/DateField";

type Props = NativeStackScreenProps<RootStackParamList, "GoalMovement">;

const ERROR_KEYS: Record<string, string> = {
  invalid_amount: "amount.mustBePositive",
  release_exceeds_goal: "goals.releaseTooMuch",
  goal_is_linked: "goals.linkedHint",
};

/**
 * Move money between an account and a manual goal (FR-12.3, FR-12.4).
 * The combined total never changes: the account goes down, the goal goes up,
 * and it is never counted as spending.
 */
export default function GoalMovementScreen({ route, navigation }: Props) {
  const { t } = useTranslation();
  const lang = useAppLanguage();
  const { goalId, direction } = route.params;
  const accounts = useLedgerStore((s) => s.accounts);
  const lastUsedAccountId = useLedgerStore((s) => s.lastUsedAccountId);
  const addGoalMovement = useLedgerStore((s) => s.addGoalMovement);

  const todayDate = today();
  const [goal, setGoal] = useState<GoalWithProgress | null | undefined>(
    undefined,
  );
  const [amountText, setAmountText] = useState("");
  const [accountId, setAccountId] = useState<ID | null>(() =>
    defaultAccountId(accounts, lastUsedAccountId),
  );
  const [occurredOn, setOccurredOn] = useState(todayDate);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const found = await getGoal(await getDb(), goalId, todayDate);
      if (!cancelled) setGoal(found);
    })();
    return () => {
      cancelled = true;
    };
  }, [goalId, todayDate]);

  const options = useMemo(() => activeAccounts(accounts), [accounts]);

  if (goal === undefined)
    return <ActivityIndicator style={styles.loader} color={colors.primary} />;
  if (goal === null) return null;

  const amount = parseAmount(amountText);
  const account = accounts.find((a) => a.id === accountId);
  const preview =
    amount !== null && amount > 0 && account
      ? direction === "contribution"
        ? { account: account.balance - amount, goal: goal.saved + amount }
        : { account: account.balance + amount, goal: goal.saved - amount }
      : null;

  const save = async () => {
    if (amount === null || !isValidEntryAmount(amount))
      return setError(t("amount.mustBePositive"));
    if (accountId === null) return setError(t("entryForm.selectAccount"));

    setError(null);
    setSaving(true);
    try {
      await addGoalMovement({
        goalId,
        accountId,
        direction,
        amount,
        occurredOn,
        note,
      });
      navigation.goBack();
    } catch (e) {
      const code = (e as Error).message;
      setError(
        ERROR_KEYS[code]
          ? t(ERROR_KEYS[code])
          : t("errors.saveFailed", { message: code }),
      );
      setSaving(false);
    }
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={typography.title}>{goal.name}</Text>
        <Text style={typography.caption}>
          {t("goals.currentlySaved", {
            amount: formatRupiah(goal.saved, lang),
          })}
        </Text>

        <Text style={[typography.label, styles.label]}>
          {t("entryForm.amount")}
        </Text>
        <AmountInput
          value={amountText}
          onChangeText={setAmountText}
          lang={lang}
          autoFocus
          large
          error={error}
        />

        <Text style={[typography.label, styles.label]}>
          {direction === "contribution"
            ? t("goals.fromWhichAccount")
            : t("goals.toWhichAccount")}
        </Text>
        <View style={styles.wrap}>
          {options.map((a) => (
            <Chip
              key={a.id}
              label={a.name}
              icon={ACCOUNT_TYPE_ICONS[a.type]}
              selected={accountId === a.id}
              onPress={() => setAccountId(a.id)}
            />
          ))}
        </View>

        {preview && account ? (
          <View style={styles.preview}>
            <View style={styles.previewRow}>
              <Text style={typography.body} numberOfLines={1}>
                {account.name}
              </Text>
              <Text
                style={[
                  typography.amount,
                  {
                    color:
                      direction === "contribution"
                        ? colors.expense
                        : colors.income,
                  },
                ]}
              >
                {formatRupiah(preview.account, lang)}
              </Text>
            </View>
            <View style={styles.previewRow}>
              <Text style={typography.body} numberOfLines={1}>
                {goal.name}
              </Text>
              <Text
                style={[
                  typography.amount,
                  {
                    color:
                      direction === "contribution"
                        ? colors.income
                        : colors.expense,
                  },
                ]}
              >
                {formatRupiah(preview.goal, lang)}
              </Text>
            </View>
            <Text style={typography.caption}>{t("goals.notSpending")}</Text>
          </View>
        ) : null}

        <Text style={[typography.label, styles.label]}>
          {t("entryForm.date")}
        </Text>
        <DateField
          value={occurredOn}
          onChange={setOccurredOn}
          lang={lang}
          todayDate={todayDate}
        />

        <Text style={[typography.label, styles.label]}>
          {t("entryForm.note")}
        </Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          style={styles.textInput}
          maxLength={200}
        />
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label={
            direction === "contribution"
              ? t("goals.contribute")
              : t("goals.release")
          }
          onPress={save}
          loading={saving}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  loader: { marginTop: spacing.xl },
  content: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
  label: { marginTop: spacing.md },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  preview: {
    marginTop: spacing.sm,
    padding: spacing.md,
    gap: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  previewRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  textInput: {
    minHeight: 52,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    fontSize: 16,
    color: colors.text,
  },
  footer: {
    padding: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
});
