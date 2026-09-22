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
import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { useTranslation } from "react-i18next";
import { getDb } from "../db/client";
import { getEntry } from "../db/entriesDao";
import { categoryLabel } from "../i18n";
import { useAppLanguage } from "../i18n/useAppLanguage";
import { parseISODate, toISODate, today, yesterday } from "../lib/dates";
import { formatDate } from "../lib/dateLabels";
import { formatNumber, isValidEntryAmount, parseAmount } from "../lib/money";
import {
  activeAccounts,
  defaultAccountId,
  useLedgerStore,
} from "../store/ledgerStore";
import { colors, radius, spacing, typography } from "../theme";
import type { Entry, ID } from "../types";
import type { RootStackParamList } from "../navigation/types";
import { ACCOUNT_TYPE_ICONS } from "../components/accountTypes";
import AmountInput from "../components/AmountInput";
import Button from "../components/Button";
import Chip from "../components/Chip";

type Props = NativeStackScreenProps<RootStackParamList, "EntryForm">;
type FormType = "expense" | "income";

/**
 * Add or edit an expense or income (FR-2, FR-4).
 * Quick-add is three taps: the + button, a category, Save. The amount field
 * is focused on open, and account and date are pre-filled (FR-2.8).
 */
export default function EntryFormScreen({ route, navigation }: Props) {
  const { t } = useTranslation();
  const lang = useAppLanguage();
  const entryId = route.params?.entryId;

  const accounts = useLedgerStore((s) => s.accounts);
  const categories = useLedgerStore((s) => s.categories);
  const lastUsedAccountId = useLedgerStore((s) => s.lastUsedAccountId);
  const saveEntry = useLedgerStore((s) => s.saveEntry);
  const deleteEntry = useLedgerStore((s) => s.deleteEntry);

  const todayDate = today();
  const [loaded, setLoaded] = useState(entryId === undefined);
  const [original, setOriginal] = useState<Entry | null>(null);
  const [type, setType] = useState<FormType>(route.params?.type ?? "expense");
  const [amountText, setAmountText] = useState("");
  const [categoryId, setCategoryId] = useState<ID | null>(null);
  const [accountId, setAccountId] = useState<ID | null>(() =>
    defaultAccountId(accounts, lastUsedAccountId),
  );
  const [occurredOn, setOccurredOn] = useState(todayDate);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Edit mode: load the entry once.
  useEffect(() => {
    if (entryId === undefined) return;
    let cancelled = false;
    (async () => {
      const entry = await getEntry(await getDb(), entryId);
      if (cancelled) return;
      if (!entry) {
        navigation.goBack();
        return;
      }
      setOriginal(entry);
      if (entry.type !== "adjustment") setType(entry.type);
      setAmountText(formatNumber(Math.abs(entry.amount), lang));
      setCategoryId(entry.categoryId);
      setAccountId(entry.accountId);
      setOccurredOn(entry.occurredOn);
      setNote(entry.note ?? "");
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
    // lang is read once for the initial text only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryId, navigation]);

  // Pickers hide archived items, except the one this entry already uses (FR-6.3).
  const categoryOptions = useMemo(
    () =>
      categories.filter(
        (c) =>
          c.type === type &&
          c.builtinKey === null &&
          (!c.archived || c.id === categoryId),
      ),
    [categories, type, categoryId],
  );
  const accountOptions = useMemo(
    () => accounts.filter((a) => !a.archived || a.id === accountId),
    [accounts, accountId],
  );

  const switchType = (next: FormType) => {
    if (next === type) return;
    setType(next);
    // Categories are per type, so a category from the other type can't stay selected.
    setCategoryId(null);
  };

  const pickDate = () => {
    DateTimePickerAndroid.open({
      value: parseISODate(occurredOn),
      mode: "date",
      onChange: (event, date) => {
        if (event.type === "set" && date) setOccurredOn(toISODate(date));
      },
    });
  };

  const save = async () => {
    const amount = parseAmount(amountText);
    if (amount === null) return setError(t("amount.invalid"));
    if (!isValidEntryAmount(amount))
      return setError(t("amount.mustBePositive"));
    if (categoryId === null) return setError(t("entryForm.selectCategory"));
    if (accountId === null) return setError(t("entryForm.selectAccount"));

    setError(null);
    setSaving(true);
    try {
      await saveEntry(
        { type, amount, accountId, categoryId, occurredOn, note },
        entryId,
      );
      navigation.goBack();
    } catch (e) {
      setError(
        t("errors.saveFailed", { message: String((e as Error).message ?? e) }),
      );
      setSaving(false);
    }
  };

  const remove = async () => {
    if (entryId === undefined) return;
    await deleteEntry(entryId);
    navigation.goBack();
  };

  if (!loaded) {
    return <ActivityIndicator style={styles.loader} color={colors.primary} />;
  }

  // Reconciliation adjustments get their own editor in phase 2.
  if (original?.type === "adjustment") {
    return (
      <View style={[styles.screen, styles.content]}>
        <Text style={typography.body}>{t("entryForm.adjustmentLater")}</Text>
        <Button
          label={t("entryForm.delete")}
          variant="danger"
          onPress={remove}
        />
      </View>
    );
  }

  if (activeAccounts(accounts).length === 0 && entryId === undefined) {
    return (
      <View style={[styles.screen, styles.content]}>
        <Text style={typography.body}>{t("entryForm.noAccount")}</Text>
        <Button
          label={t("accounts.add")}
          onPress={() => navigation.replace("AccountForm")}
        />
      </View>
    );
  }

  const isOtherDate = occurredOn !== todayDate && occurredOn !== yesterday();

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.typeRow}>
          <Chip
            label={t("entryForm.expense")}
            selected={type === "expense"}
            onPress={() => switchType("expense")}
          />
          <Chip
            label={t("entryForm.income")}
            selected={type === "income"}
            onPress={() => switchType("income")}
          />
        </View>

        <AmountInput
          value={amountText}
          onChangeText={setAmountText}
          lang={lang}
          autoFocus={entryId === undefined}
          large
        />

        <Text style={[typography.label, styles.label]}>
          {t("entryForm.category")}
        </Text>
        <View style={styles.wrap}>
          {categoryOptions.map((c) => (
            <Chip
              key={c.id}
              label={
                c.archived
                  ? `${categoryLabel(c)} ${t("entryForm.archivedSuffix")}`
                  : categoryLabel(c)
              }
              icon={c.icon}
              color={c.color}
              selected={categoryId === c.id}
              onPress={() => setCategoryId(c.id)}
            />
          ))}
        </View>

        <Text style={[typography.label, styles.label]}>
          {t("entryForm.account")}
        </Text>
        <View style={styles.wrap}>
          {accountOptions.map((a) => (
            <Chip
              key={a.id}
              label={a.name}
              icon={ACCOUNT_TYPE_ICONS[a.type]}
              selected={accountId === a.id}
              onPress={() => setAccountId(a.id)}
            />
          ))}
        </View>

        <Text style={[typography.label, styles.label]}>
          {t("entryForm.date")}
        </Text>
        <View style={styles.wrap}>
          <Chip
            label={t("common.today")}
            selected={occurredOn === todayDate}
            onPress={() => setOccurredOn(todayDate)}
          />
          <Chip
            label={t("common.yesterday")}
            selected={occurredOn === yesterday()}
            onPress={() => setOccurredOn(yesterday())}
          />
          <Chip
            label={
              isOtherDate
                ? formatDate(occurredOn, lang, { todayDate, weekday: true })
                : t("entryForm.pickDate")
            }
            icon="calendar"
            selected={isOtherDate}
            onPress={pickDate}
          />
        </View>
        {occurredOn > todayDate ? (
          <Text style={typography.caption}>
            {t("entryForm.futureHint", {
              date: formatDate(occurredOn, lang, { todayDate }),
            })}
          </Text>
        ) : null}

        <Text style={[typography.label, styles.label]}>
          {t("entryForm.note")}
        </Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          style={styles.textInput}
          placeholderTextColor={colors.textMuted}
          maxLength={200}
        />

        {entryId !== undefined ? (
          <Button
            label={t("entryForm.delete")}
            variant="danger"
            onPress={remove}
            style={styles.delete}
          />
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
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loader: {
    marginTop: spacing.xl,
  },
  content: {
    padding: spacing.md,
    gap: spacing.sm,
    paddingBottom: spacing.xl,
  },
  typeRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  label: {
    marginTop: spacing.md,
  },
  wrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
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
  delete: {
    marginTop: spacing.xl,
  },
  footer: {
    padding: spacing.md,
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  error: {
    fontSize: 13,
    color: colors.expense,
  },
});
