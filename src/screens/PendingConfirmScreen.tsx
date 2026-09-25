import { useEffect, useState } from "react";
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
import { listPendingEntries, type PendingWithRule } from "../db/recurringDao";
import { categoryLabel } from "../i18n";
import { useAppLanguage } from "../i18n/useAppLanguage";
import { today } from "../lib/dates";
import { formatDate } from "../lib/dateLabels";
import { formatNumber, isValidEntryAmount, parseAmount } from "../lib/money";
import { useLedgerStore } from "../store/ledgerStore";
import { radius, spacing } from "../theme";
import { makeStyles, useTheme } from "../theme/ThemeProvider";
import type { RootStackParamList } from "../navigation/types";
import AmountInput from "../components/AmountInput";
import Button from "../components/Button";

type Props = NativeStackScreenProps<RootStackParamList, "PendingConfirm">;

/**
 * FR-11.4 and FR-11.5: confirm an occurrence, with the amount editable, or
 * skip it. The entry is dated the due date, not today, and nothing touches a
 * balance until this screen's Confirm.
 */
export default function PendingConfirmScreen({ route, navigation }: Props) {
  const { colors, typography } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const lang = useAppLanguage();
  const confirmPending = useLedgerStore((s) => s.confirmPending);
  const skipPending = useLedgerStore((s) => s.skipPending);

  const [pending, setPending] = useState<PendingWithRule | null | undefined>(
    undefined,
  );
  const [amountText, setAmountText] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const found =
        (await listPendingEntries(await getDb())).find(
          (p) => p.id === route.params.pendingId,
        ) ?? null;
      if (cancelled) return;
      setPending(found);
      if (found) {
        setAmountText(formatNumber(found.rule.amount, lang));
        setNote(found.rule.note ?? "");
      }
    })();
    return () => {
      cancelled = true;
    };
    // lang is read once for the initial text only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params.pendingId]);

  if (pending === undefined)
    return <ActivityIndicator style={styles.loader} color={colors.primary} />;
  if (pending === null) {
    return (
      <View style={[styles.screen, styles.content]}>
        <Text style={typography.body}>{t("pending.gone")}</Text>
        <Button label={t("common.done")} onPress={() => navigation.goBack()} />
      </View>
    );
  }

  const { rule } = pending;
  const what =
    rule.type === "transfer"
      ? `${pending.accountName} → ${pending.toAccountName ?? ""}`
      : pending.categoryName
        ? `${categoryLabel({ name: pending.categoryName, i18nKey: pending.categoryI18nKey })} · ${pending.accountName}`
        : pending.accountName;

  const confirm = async () => {
    const amount = parseAmount(amountText);
    if (amount === null) return setError(t("amount.invalid"));
    if (!isValidEntryAmount(amount))
      return setError(t("amount.mustBePositive"));
    setError(null);
    setBusy(true);
    try {
      await confirmPending(pending.id, { amount, note });
      navigation.goBack();
    } catch (e) {
      setError(
        t("errors.saveFailed", { message: String((e as Error).message ?? e) }),
      );
      setBusy(false);
    }
  };

  const skip = async () => {
    setBusy(true);
    await skipPending(pending.id);
    navigation.goBack();
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
          <Text style={typography.label}>
            {t(`recurring.types.${rule.type}`)}
          </Text>
          <Text style={typography.title}>{what}</Text>
          <Text style={typography.caption}>
            {t("pending.willBeDated", {
              date: formatDate(pending.dueDate, lang, {
                todayDate: today(),
                weekday: true,
              }),
            })}
          </Text>
          {rule.type === "transfer" && rule.fee > 0 ? (
            <Text style={typography.caption}>
              {t("transfers.feeCaption", {
                amount: formatNumber(rule.fee, lang),
                payer:
                  rule.feePaidBy === "sender"
                    ? t("transfers.payerSender")
                    : t("transfers.payerRecipient"),
              })}
            </Text>
          ) : null}
        </View>

        <Text style={[typography.label, styles.label]}>
          {t("entryForm.amount")}
        </Text>
        <AmountInput
          value={amountText}
          onChangeText={setAmountText}
          lang={lang}
          large
          error={error}
        />
        <Text style={typography.caption}>{t("pending.amountHint")}</Text>

        <Text style={[typography.label, styles.label]}>
          {t("entryForm.note")}
        </Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          style={styles.textInput}
          maxLength={200}
        />

        <Button
          label={t("pending.skip")}
          variant="secondary"
          onPress={skip}
          disabled={busy}
          style={styles.skip}
        />
        <Text style={typography.caption}>{t("pending.skipHint")}</Text>
      </ScrollView>

      <View style={styles.footer}>
        <Button label={t("pending.confirm")} onPress={confirm} loading={busy} />
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.background },
  loader: { marginTop: spacing.xl },
  content: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
  card: {
    padding: spacing.md,
    gap: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: c.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
  },
  label: { marginTop: spacing.md },
  textInput: {
    minHeight: 52,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
    fontSize: 16,
    color: c.text,
  },
  skip: { marginTop: spacing.xl },
  footer: {
    padding: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.border,
    backgroundColor: c.surface,
  },
}));
