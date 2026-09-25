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
import { getGoal } from "../db/goalsDao";
import { useAppLanguage } from "../i18n/useAppLanguage";
import { parseISODate, toISODate, today, type ISODate } from "../lib/dates";
import { formatDate } from "../lib/dateLabels";
import { formatNumber, isValidEntryAmount, parseAmount } from "../lib/money";
import { useLedgerStore } from "../store/ledgerStore";
import { radius, spacing } from "../theme";
import { makeStyles, useTheme } from "../theme/ThemeProvider";
import type { GoalMeasure, ID } from "../types";
import type { RootStackParamList } from "../navigation/types";
import { ACCOUNT_TYPE_ICONS } from "../components/accountTypes";
import AmountInput from "../components/AmountInput";
import Button from "../components/Button";
import Chip from "../components/Chip";
import Segmented from "../components/Segmented";

type Props = NativeStackScreenProps<RootStackParamList, "GoalForm">;

const ERROR_KEYS: Record<string, string> = {
  name_required: "goals.nameRequired",
  invalid_amount: "amount.mustBePositive",
  choose_account: "goals.chooseAccount",
  measure_locked: "goals.measureLocked",
};

/** Create or edit a goal (FR-12.1). The measure is fixed once money is in it. */
export default function GoalFormScreen({ route, navigation }: Props) {
  const { colors, typography } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const lang = useAppLanguage();
  const goalId = route.params?.goalId;
  const accounts = useLedgerStore((s) => s.accounts);
  const saveGoal = useLedgerStore((s) => s.saveGoal);
  const setArchived = useLedgerStore((s) => s.setGoalArchived);

  const todayDate = today();
  const [loaded, setLoaded] = useState(goalId === undefined);
  const [archived, setArchivedState] = useState(false);
  const [hasMoney, setHasMoney] = useState(false);
  const [name, setName] = useState("");
  const [targetText, setTargetText] = useState("");
  const [targetDate, setTargetDate] = useState<ISODate | null>(null);
  const [measure, setMeasure] = useState<GoalMeasure>("manual");
  const [linkedAccountId, setLinkedAccountId] = useState<ID | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (goalId === undefined) return;
    let cancelled = false;
    (async () => {
      const goal = await getGoal(await getDb(), goalId, todayDate);
      if (cancelled) return;
      if (!goal) {
        navigation.goBack();
        return;
      }
      setArchivedState(goal.archived);
      setHasMoney(goal.measure === "manual" && goal.saved !== 0);
      setName(goal.name);
      setTargetText(formatNumber(goal.targetAmount, lang));
      setTargetDate(goal.targetDate);
      setMeasure(goal.measure);
      setLinkedAccountId(goal.linkedAccountId);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
    // lang is read once for the initial text only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goalId, navigation, todayDate]);

  const accountOptions = useMemo(
    () => accounts.filter((a) => !a.archived || a.id === linkedAccountId),
    [accounts, linkedAccountId],
  );

  if (!loaded)
    return <ActivityIndicator style={styles.loader} color={colors.primary} />;

  const pickDate = () => {
    DateTimePickerAndroid.open({
      value: parseISODate(targetDate ?? todayDate),
      mode: "date",
      onChange: (event, date) => {
        if (event.type === "set" && date) setTargetDate(toISODate(date));
      },
    });
  };

  const save = async () => {
    const target = parseAmount(targetText);
    if (name.trim().length === 0) return setError(t("goals.nameRequired"));
    if (target === null || !isValidEntryAmount(target))
      return setError(t("amount.mustBePositive"));
    if (measure === "linked" && linkedAccountId === null)
      return setError(t("goals.chooseAccount"));

    setError(null);
    setSaving(true);
    try {
      await saveGoal(
        { name, targetAmount: target, targetDate, measure, linkedAccountId },
        goalId,
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
    if (goalId === undefined) return;
    await setArchived(goalId, !archived);
    navigation.goBack();
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={typography.label}>{t("goals.name")}</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={t("goals.namePlaceholder")}
          placeholderTextColor={colors.textMuted}
          style={styles.textInput}
          autoFocus={goalId === undefined}
          maxLength={40}
        />

        <Text style={[typography.label, styles.label]}>
          {t("goals.target")}
        </Text>
        <AmountInput
          value={targetText}
          onChangeText={setTargetText}
          lang={lang}
          large
        />

        <Text style={[typography.label, styles.label]}>
          {t("goals.targetDate")}
        </Text>
        <View style={styles.wrap}>
          <Chip
            label={
              targetDate
                ? formatDate(targetDate, lang, { todayDate })
                : t("goals.noTargetDate")
            }
            icon="calendar"
            selected={targetDate !== null}
            onPress={pickDate}
          />
          {targetDate ? (
            <Chip
              label={t("goals.clearTargetDate")}
              onPress={() => setTargetDate(null)}
            />
          ) : null}
        </View>

        <Text style={[typography.label, styles.label]}>
          {t("goals.measure")}
        </Text>
        <Segmented
          options={[
            { value: "manual", label: t("goals.measureManual") },
            { value: "linked", label: t("goals.measureLinked") },
          ]}
          value={measure}
          onChange={(v) => !hasMoney && setMeasure(v)}
        />
        <Text style={typography.caption}>
          {hasMoney
            ? t("goals.measureLocked")
            : measure === "manual"
              ? t("goals.manualHint")
              : t("goals.linkedHint")}
        </Text>

        {measure === "linked" ? (
          <View style={styles.wrap}>
            {accountOptions.map((a) => (
              <Chip
                key={a.id}
                label={a.name}
                icon={ACCOUNT_TYPE_ICONS[a.type]}
                selected={linkedAccountId === a.id}
                onPress={() => setLinkedAccountId(a.id)}
              />
            ))}
          </View>
        ) : null}

        {goalId !== undefined ? (
          <View style={styles.archiveBox}>
            <Button
              label={archived ? t("goals.restore") : t("goals.archive")}
              variant="secondary"
              onPress={toggleArchived}
            />
            <Text style={typography.caption}>{t("goals.archiveHint")}</Text>
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

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.background },
  loader: { marginTop: spacing.xl },
  content: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
  label: { marginTop: spacing.md },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
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
  archiveBox: { marginTop: spacing.xl, gap: spacing.sm },
  error: { fontSize: 13, color: c.expense },
  footer: {
    padding: spacing.md,
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.border,
    backgroundColor: c.surface,
  },
}));
