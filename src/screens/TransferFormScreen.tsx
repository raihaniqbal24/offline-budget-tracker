import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useTranslation } from "react-i18next";
import { getDb } from "../db/client";
import { getTransfer, transferEffect } from "../db/transfersDao";
import { useAppLanguage } from "../i18n/useAppLanguage";
import { today } from "../lib/dates";
import { formatNumber, formatSignedRupiah, isValidEntryAmount, parseAmount } from "../lib/money";
import { activeAccounts, defaultAccountId, useLedgerStore } from "../store/ledgerStore";
import { colors, radius, spacing, typography } from "../theme";
import type { FeePaidBy, ID } from "../types";
import type { RootStackParamList } from "../navigation/types";
import { ACCOUNT_TYPE_ICONS } from "../components/accountTypes";
import AmountInput from "../components/AmountInput";
import Button from "../components/Button";
import Chip from "../components/Chip";
import DateField from "../components/DateField";

type Props = NativeStackScreenProps<RootStackParamList, "TransferForm">;

const ERROR_KEYS: Record<string, string> = {
  same_account: "transfers.errors.sameAccount",
  invalid_amount: "amount.mustBePositive",
  invalid_fee: "transfers.errors.invalidFee",
  fee_exceeds_amount: "transfers.errors.feeExceedsAmount",
};

/** Record or edit a transfer between two accounts, with an optional fee (FR-5.1 to FR-5.4). */
export default function TransferFormScreen({ route, navigation }: Props) {
  const { t } = useTranslation();
  const lang = useAppLanguage();
  const transferId = route.params?.transferId;

  const accounts = useLedgerStore((s) => s.accounts);
  const lastUsedAccountId = useLedgerStore((s) => s.lastUsedAccountId);
  const saveTransfer = useLedgerStore((s) => s.saveTransfer);
  const deleteTransfer = useLedgerStore((s) => s.deleteTransfer);

  const todayDate = today();
  const [loaded, setLoaded] = useState(transferId === undefined);
  const [fromId, setFromId] = useState<ID | null>(
    () => route.params?.fromAccountId ?? defaultAccountId(accounts, lastUsedAccountId)
  );
  const [toId, setToId] = useState<ID | null>(null);
  const [amountText, setAmountText] = useState("");
  const [feeText, setFeeText] = useState("");
  const [feePaidBy, setFeePaidBy] = useState<FeePaidBy>("sender");
  const [occurredOn, setOccurredOn] = useState(todayDate);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (transferId === undefined) return;
    let cancelled = false;
    (async () => {
      const transfer = await getTransfer(await getDb(), transferId);
      if (cancelled) return;
      if (!transfer) {
        navigation.goBack();
        return;
      }
      setFromId(transfer.fromAccountId);
      setToId(transfer.toAccountId);
      setAmountText(formatNumber(transfer.amount, lang));
      setFeeText(transfer.fee > 0 ? formatNumber(transfer.fee, lang) : "");
      setFeePaidBy(transfer.feePaidBy);
      setOccurredOn(transfer.occurredOn);
      setNote(transfer.note ?? "");
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
    // lang is read once for the initial text only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transferId, navigation]);

  // Archived accounts stay selectable only if this transfer already uses them.
  const options = useMemo(
    () => accounts.filter((a) => !a.archived || a.id === fromId || a.id === toId),
    [accounts, fromId, toId]
  );
  const toOptions = options.filter((a) => a.id !== fromId);

  const amount = parseAmount(amountText);
  const fee = feeText.trim() === "" ? 0 : parseAmount(feeText);
  const fromName = accounts.find((a) => a.id === fromId)?.name;
  const toName = accounts.find((a) => a.id === toId)?.name;
  const preview =
    amount && amount > 0 && fee !== null && fromName && toName
      ? transferEffect({ amount, fee, feePaidBy })
      : null;

  const chooseFrom = (id: ID) => {
    setFromId(id);
    if (toId === id) setToId(null);
  };

  const save = async () => {
    if (fromId === null || toId === null) return setError(t("transfers.errors.chooseAccounts"));
    if (amount === null) return setError(t("amount.invalid"));
    if (!isValidEntryAmount(amount)) return setError(t("amount.mustBePositive"));
    if (fee === null) return setError(t("transfers.errors.invalidFee"));

    setError(null);
    setSaving(true);
    try {
      await saveTransfer(
        { fromAccountId: fromId, toAccountId: toId, amount, fee, feePaidBy, occurredOn, note },
        transferId
      );
      navigation.goBack();
    } catch (e) {
      const code = (e as Error).message;
      setError(ERROR_KEYS[code] ? t(ERROR_KEYS[code]) : t("errors.saveFailed", { message: code }));
      setSaving(false);
    }
  };

  const remove = async () => {
    if (transferId === undefined) return;
    await deleteTransfer(transferId);
    navigation.goBack();
  };

  if (!loaded) return <ActivityIndicator style={styles.loader} color={colors.primary} />;

  if (activeAccounts(accounts).length < 2 && transferId === undefined) {
    return (
      <View style={[styles.screen, styles.content]}>
        <Text style={typography.body}>{t("transfers.needTwoAccounts")}</Text>
        <Button label={t("accounts.add")} onPress={() => navigation.replace("AccountForm")} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={typography.label}>{t("transfers.from")}</Text>
        <View style={styles.wrap}>
          {options.map((a) => (
            <Chip key={a.id} label={a.name} icon={ACCOUNT_TYPE_ICONS[a.type]} selected={fromId === a.id} onPress={() => chooseFrom(a.id)} />
          ))}
        </View>

        <Text style={[typography.label, styles.label]}>{t("transfers.to")}</Text>
        <View style={styles.wrap}>
          {toOptions.map((a) => (
            <Chip key={a.id} label={a.name} icon={ACCOUNT_TYPE_ICONS[a.type]} selected={toId === a.id} onPress={() => setToId(a.id)} />
          ))}
        </View>

        <Text style={[typography.label, styles.label]}>{t("entryForm.amount")}</Text>
        <AmountInput value={amountText} onChangeText={setAmountText} lang={lang} autoFocus={transferId === undefined} large />

        <Text style={[typography.label, styles.label]}>{t("transfers.fee")}</Text>
        <AmountInput value={feeText} onChangeText={setFeeText} lang={lang} />
        {fee !== null && fee > 0 ? (
          <View style={styles.wrap}>
            <Chip label={t("transfers.senderPays")} selected={feePaidBy === "sender"} onPress={() => setFeePaidBy("sender")} />
            <Chip label={t("transfers.recipientPays")} selected={feePaidBy === "recipient"} onPress={() => setFeePaidBy("recipient")} />
          </View>
        ) : null}

        {preview ? (
          <View style={styles.preview}>
            <PreviewLine name={fromName!} delta={preview.fromDelta} lang={lang} />
            <PreviewLine name={toName!} delta={preview.toDelta} lang={lang} />
          </View>
        ) : null}

        <Text style={[typography.label, styles.label]}>{t("entryForm.date")}</Text>
        <DateField value={occurredOn} onChange={setOccurredOn} lang={lang} todayDate={todayDate} />

        <Text style={[typography.label, styles.label]}>{t("entryForm.note")}</Text>
        <TextInput value={note} onChangeText={setNote} style={styles.textInput} maxLength={200} />

        {transferId !== undefined ? (
          <Button label={t("transfers.delete")} variant="danger" onPress={remove} style={styles.delete} />
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button label={t("common.save")} onPress={save} loading={saving} />
      </View>
    </View>
  );
}

function PreviewLine({ name, delta, lang }: { name: string; delta: number; lang: "en" | "id" }) {
  return (
    <View style={styles.previewLine}>
      <Text style={typography.body} numberOfLines={1}>
        {name}
      </Text>
      <Text style={[typography.amount, { color: delta < 0 ? colors.expense : colors.income }]}>
        {formatSignedRupiah(delta, lang)}
      </Text>
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
  previewLine: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md },
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
  delete: { marginTop: spacing.xl },
  footer: {
    padding: spacing.md,
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  error: { fontSize: 13, color: colors.expense },
});