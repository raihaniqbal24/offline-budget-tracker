import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { useTranslation } from "react-i18next";
import { getDb } from "../db/client";
import { getRule } from "../db/recurringDao";
import { categoryLabel } from "../i18n";
import { useAppLanguage } from "../i18n/useAppLanguage";
import {
  parseISODate,
  toISODate,
  today,
  type Frequency,
  type ISODate,
} from "../lib/dates";
import { formatDate } from "../lib/dateLabels";
import { formatNumber, isValidEntryAmount, parseAmount } from "../lib/money";
import { useLedgerStore } from "../store/ledgerStore";
import { colors, radius, spacing, typography } from "../theme";
import type { FeePaidBy, ID, RecurringType } from "../types";
import type { RootStackParamList } from "../navigation/types";
import { ACCOUNT_TYPE_ICONS } from "../components/accountTypes";
import AmountInput from "../components/AmountInput";
import Button from "../components/Button";
import Chip from "../components/Chip";
import DateField from "../components/DateField";

type Props = NativeStackScreenProps<RootStackParamList, "RecurringForm">;

const FREQUENCIES: Frequency[] = ["daily", "weekly", "monthly", "yearly"];
const TYPES: RecurringType[] = ["expense", "income", "transfer"];

const ERROR_KEYS: Record<string, string> = {
  invalid_amount: "amount.mustBePositive",
  end_before_start: "recurring.errors.endBeforeStart",
  choose_category: "entryForm.selectCategory",
  choose_accounts: "transfers.errors.chooseAccounts",
  same_account: "transfers.errors.sameAccount",
  fee_exceeds_amount: "transfers.errors.feeExceedsAmount",
};

/** Create or edit a recurring rule (FR-11.1). Changes apply to future occurrences only (FR-11.7). */
export default function RecurringFormScreen({ route, navigation }: Props) {
  const { t } = useTranslation();
  const lang = useAppLanguage();
  const ruleId = route.params?.ruleId;

  const accounts = useLedgerStore((s) => s.accounts);
  const categories = useLedgerStore((s) => s.categories);
  const saveRule = useLedgerStore((s) => s.saveRule);
  const setArchived = useLedgerStore((s) => s.setRuleArchived);

  const todayDate = today();
  const [loaded, setLoaded] = useState(ruleId === undefined);
  const [archived, setArchivedState] = useState(false);
  const [type, setType] = useState<RecurringType>("expense");
  const [amountText, setAmountText] = useState("");
  const [accountId, setAccountId] = useState<ID | null>(null);
  const [toAccountId, setToAccountId] = useState<ID | null>(null);
  const [categoryId, setCategoryId] = useState<ID | null>(null);
  const [feeText, setFeeText] = useState("");
  const [feePaidBy, setFeePaidBy] = useState<FeePaidBy>("sender");
  const [frequency, setFrequency] = useState<Frequency>("monthly");
  const [startDate, setStartDate] = useState<ISODate>(todayDate);
  const [endDate, setEndDate] = useState<ISODate | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (ruleId === undefined) return;
    let cancelled = false;
    (async () => {
      const rule = await getRule(await getDb(), ruleId);
      if (cancelled) return;
      if (!rule) {
        navigation.goBack();
        return;
      }
      setArchivedState(rule.archived);
      setType(rule.type);
      setAmountText(formatNumber(rule.amount, lang));
      setAccountId(rule.accountId);
      setToAccountId(rule.toAccountId);
      setCategoryId(rule.categoryId);
      setFeeText(rule.fee > 0 ? formatNumber(rule.fee, lang) : "");
      setFeePaidBy(rule.feePaidBy);
      setFrequency(rule.frequency);
      setStartDate(rule.startDate);
      setEndDate(rule.endDate);
      setNote(rule.note ?? "");
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
    // lang is read once for the initial text only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ruleId, navigation]);

  const accountOptions = useMemo(
    () =>
      accounts.filter(
        (a) => !a.archived || a.id === accountId || a.id === toAccountId,
      ),
    [accounts, accountId, toAccountId],
  );
  const categoryOptions = useMemo(
    () =>
      categories.filter(
        (c) =>
          c.type === (type === "income" ? "income" : "expense") &&
          c.builtinKey === null &&
          (!c.archived || c.id === categoryId),
      ),
    [categories, type, categoryId],
  );

  if (!loaded)
    return <ActivityIndicator style={styles.loader} color={colors.primary} />;

  const fee = feeText.trim() === "" ? 0 : parseAmount(feeText);

  const pickEndDate = () => {
    DateTimePickerAndroid.open({
      value: parseISODate(endDate ?? startDate),
      mode: "date",
      onChange: (event, date) => {
        if (event.type === "set" && date) setEndDate(toISODate(date));
      },
    });
  };

  const save = async () => {
    const amount = parseAmount(amountText);
    if (amount === null || !isValidEntryAmount(amount))
      return setError(t("amount.mustBePositive"));
    if (accountId === null) return setError(t("entryForm.selectAccount"));
    if (fee === null) return setError(t("transfers.errors.invalidFee"));

    setError(null);
    setSaving(true);
    try {
      await saveRule(
        {
          type,
          amount,
          accountId,
          toAccountId: type === "transfer" ? toAccountId : null,
          categoryId: type === "transfer" ? null : categoryId,
          fee: type === "transfer" ? fee : 0,
          feePaidBy,
          note,
          frequency,
          startDate,
          endDate,
        },
        ruleId,
      );
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

  const toggleArchived = async () => {
    if (ruleId === undefined) return;
    await setArchived(ruleId, !archived);
    navigation.goBack();
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.wrap}>
          {TYPES.map((value) => (
            <Chip
              key={value}
              label={t(`recurring.types.${value}`)}
              selected={type === value}
              onPress={() => {
                setType(value);
                setCategoryId(null);
              }}
            />
          ))}
        </View>

        <AmountInput
          value={amountText}
          onChangeText={setAmountText}
          lang={lang}
          autoFocus={ruleId === undefined}
          large
        />

        <Text style={[typography.label, styles.label]}>
          {type === "transfer" ? t("transfers.from") : t("entryForm.account")}
        </Text>
        <View style={styles.wrap}>
          {accountOptions.map((a) => (
            <Chip
              key={a.id}
              label={a.name}
              icon={ACCOUNT_TYPE_ICONS[a.type]}
              selected={accountId === a.id}
              onPress={() => {
                setAccountId(a.id);
                if (toAccountId === a.id) setToAccountId(null);
              }}
            />
          ))}
        </View>

        {type === "transfer" ? (
          <>
            <Text style={[typography.label, styles.label]}>
              {t("transfers.to")}
            </Text>
            <View style={styles.wrap}>
              {accountOptions
                .filter((a) => a.id !== accountId)
                .map((a) => (
                  <Chip
                    key={a.id}
                    label={a.name}
                    icon={ACCOUNT_TYPE_ICONS[a.type]}
                    selected={toAccountId === a.id}
                    onPress={() => setToAccountId(a.id)}
                  />
                ))}
            </View>

            <Text style={[typography.label, styles.label]}>
              {t("transfers.fee")}
            </Text>
            <AmountInput
              value={feeText}
              onChangeText={setFeeText}
              lang={lang}
            />
            {fee !== null && fee > 0 ? (
              <View style={styles.wrap}>
                <Chip
                  label={t("transfers.senderPays")}
                  selected={feePaidBy === "sender"}
                  onPress={() => setFeePaidBy("sender")}
                />
                <Chip
                  label={t("transfers.recipientPays")}
                  selected={feePaidBy === "recipient"}
                  onPress={() => setFeePaidBy("recipient")}
                />
              </View>
            ) : null}
          </>
        ) : (
          <>
            <Text style={[typography.label, styles.label]}>
              {t("entryForm.category")}
            </Text>
            <View style={styles.wrap}>
              {categoryOptions.map((c) => (
                <Chip
                  key={c.id}
                  label={categoryLabel(c)}
                  icon={c.icon}
                  color={c.color}
                  selected={categoryId === c.id}
                  onPress={() => setCategoryId(c.id)}
                />
              ))}
            </View>
          </>
        )}

        <Text style={[typography.label, styles.label]}>
          {t("recurring.frequency")}
        </Text>
        <View style={styles.wrap}>
          {FREQUENCIES.map((f) => (
            <Chip
              key={f}
              label={t(`recurring.every.${f}`)}
              selected={frequency === f}
              onPress={() => setFrequency(f)}
            />
          ))}
        </View>

        <Text style={[typography.label, styles.label]}>
          {t("recurring.startDate")}
        </Text>
        <DateField
          value={startDate}
          onChange={setStartDate}
          lang={lang}
          todayDate={todayDate}
        />
        <Text style={typography.caption}>{t("recurring.startHint")}</Text>

        <Text style={[typography.label, styles.label]}>
          {t("recurring.endDate")}
        </Text>
        <View style={styles.wrap}>
          <Chip
            label={
              endDate
                ? formatDate(endDate, lang, { todayDate })
                : t("recurring.noEnd")
            }
            icon="calendar"
            selected={endDate !== null}
            onPress={pickEndDate}
          />
          {endDate ? (
            <Chip
              label={t("recurring.clearEnd")}
              onPress={() => setEndDate(null)}
            />
          ) : null}
        </View>

        <Text style={[typography.label, styles.label]}>
          {t("entryForm.note")}
        </Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          style={styles.textInput}
          maxLength={200}
        />

        {ruleId !== undefined ? (
          <View style={styles.archiveBox}>
            <Button
              label={archived ? t("recurring.restore") : t("recurring.archive")}
              variant="secondary"
              onPress={toggleArchived}
            />
            <Text style={typography.caption}>{t("recurring.archiveHint")}</Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button label={t("common.save")} onPress={save} loading={saving} />
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
  archiveBox: { marginTop: spacing.xl, gap: spacing.sm },
  error: { fontSize: 13, color: colors.expense },
  footer: {
    padding: spacing.md,
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
});
