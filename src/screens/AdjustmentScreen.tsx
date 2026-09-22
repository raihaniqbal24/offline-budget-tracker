import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useTranslation } from "react-i18next";
import { getDb } from "../db/client";
import { adjustmentEntryType } from "../db/adjustmentsDao";
import { getEntry } from "../db/entriesDao";
import { categoryLabel } from "../i18n";
import { useAppLanguage } from "../i18n/useAppLanguage";
import { today } from "../lib/dates";
import { formatDate } from "../lib/dateLabels";
import { formatRupiah, isValidEntryAmount, parseAmount } from "../lib/money";
import { useLedgerStore } from "../store/ledgerStore";
import { colors, radius, spacing, typography } from "../theme";
import type { Entry, ID } from "../types";
import type { RootStackParamList } from "../navigation/types";
import AmountInput from "../components/AmountInput";
import Button from "../components/Button";
import Chip from "../components/Chip";
import Segmented from "../components/Segmented";

type Props = NativeStackScreenProps<RootStackParamList, "Adjustment">;
type Mode = "one" | "split";

interface Part {
  key: number;
  amountText: string;
  categoryId: ID | null;
  note: string;
}

let partKey = 0;
const newPart = (): Part => ({ key: ++partKey, amountText: "", categoryId: null, note: "" });

/**
 * Explain an Unrecorded adjustment (FR-1.6, FR-1.7): give all of it one
 * category, or split it across several and keep the rest as Unrecorded.
 */
export default function AdjustmentScreen({ route, navigation }: Props) {
  const { t } = useTranslation();
  const lang = useAppLanguage();
  const { entryId } = route.params;

  const accounts = useLedgerStore((s) => s.accounts);
  const categories = useLedgerStore((s) => s.categories);
  const categorize = useLedgerStore((s) => s.categorizeAdjustment);
  const split = useLedgerStore((s) => s.splitAdjustment);
  const deleteEntry = useLedgerStore((s) => s.deleteEntry);

  const [adjustment, setAdjustment] = useState<Entry | null>(null);
  const [mode, setMode] = useState<Mode>("one");
  const [categoryId, setCategoryId] = useState<ID | null>(null);
  const [note, setNote] = useState("");
  const [parts, setParts] = useState<Part[]>(() => [newPart()]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const entry = await getEntry(await getDb(), entryId);
      if (cancelled) return;
      if (!entry || entry.type !== "adjustment") navigation.goBack();
      else setAdjustment(entry);
    })();
    return () => {
      cancelled = true;
    };
  }, [entryId, navigation]);

  const type = adjustment ? adjustmentEntryType(adjustment.amount) : "expense";
  const options = useMemo(
    () => categories.filter((c) => c.type === type && c.builtinKey === null && !c.archived),
    [categories, type]
  );

  if (!adjustment) return <ActivityIndicator style={styles.loader} color={colors.primary} />;

  const available = Math.abs(adjustment.amount);
  const parsedParts = parts.map((p) => parseAmount(p.amountText));
  const assigned = parsedParts.reduce<number>((sum, v) => sum + (v ?? 0), 0);
  const remaining = available - assigned;
  const accountName = accounts.find((a) => a.id === adjustment.accountId)?.name ?? "";

  const updatePart = (key: number, change: Partial<Part>) =>
    setParts((prev) => prev.map((p) => (p.key === key ? { ...p, ...change } : p)));

  const save = async () => {
    setError(null);
    try {
      if (mode === "one") {
        if (categoryId === null) return setError(t("entryForm.selectCategory"));
        setSaving(true);
        await categorize(adjustment.id, categoryId, note);
      } else {
        if (parts.some((p, i) => !isValidEntryAmount(parsedParts[i]))) return setError(t("adjustment.partNeedsAmount"));
        if (parts.some((p) => p.categoryId === null)) return setError(t("adjustment.partNeedsCategory"));
        if (remaining < 0) return setError(t("adjustment.exceeds"));
        setSaving(true);
        await split(
          adjustment.id,
          parts.map((p, i) => ({ categoryId: p.categoryId!, amount: parsedParts[i]!, note: p.note }))
        );
      }
      navigation.goBack();
    } catch (e) {
      setError(t("errors.saveFailed", { message: String((e as Error).message ?? e) }));
      setSaving(false);
    }
  };

  const remove = async () => {
    await deleteEntry(adjustment.id);
    navigation.goBack();
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={typography.label}>
            {adjustment.amount < 0 ? t("adjustment.spending") : t("adjustment.income")}
          </Text>
          <Text style={[typography.amountLarge, { color: adjustment.amount < 0 ? colors.expense : colors.income }]}>
            {formatRupiah(available, lang)}
          </Text>
          <Text style={typography.caption}>
            {accountName} · {formatDate(adjustment.occurredOn, lang, { todayDate: today(), weekday: true })}
          </Text>
        </View>

        <Segmented
          options={[
            { value: "one", label: t("adjustment.modeOne") },
            { value: "split", label: t("adjustment.modeSplit") },
          ]}
          value={mode}
          onChange={(m) => {
            setMode(m);
            setError(null);
          }}
        />

        {mode === "one" ? (
          <>
            <Text style={typography.caption}>{t("adjustment.categorizeHint")}</Text>
            <View style={styles.wrap}>
              {options.map((c) => (
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
            <Text style={[typography.label, styles.label]}>{t("entryForm.note")}</Text>
            <TextInput value={note} onChangeText={setNote} style={styles.textInput} maxLength={200} />
          </>
        ) : (
          <>
            <Text style={typography.caption}>{t("adjustment.splitHint")}</Text>
            {parts.map((part, index) => (
              <View key={part.key} style={styles.part}>
                <View style={styles.partHeader}>
                  <Text style={typography.label}>{t("adjustment.part", { n: index + 1 })}</Text>
                  {parts.length > 1 ? (
                    <Pressable onPress={() => setParts((prev) => prev.filter((p) => p.key !== part.key))} hitSlop={8}>
                      <Text style={styles.link}>{t("adjustment.remove")}</Text>
                    </Pressable>
                  ) : null}
                </View>
                <AmountInput value={part.amountText} onChangeText={(v) => updatePart(part.key, { amountText: v })} lang={lang} />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow} keyboardShouldPersistTaps="handled">
                  {options.map((c) => (
                    <Chip
                      key={c.id}
                      label={categoryLabel(c)}
                      icon={c.icon}
                      color={c.color}
                      selected={part.categoryId === c.id}
                      onPress={() => updatePart(part.key, { categoryId: c.id })}
                    />
                  ))}
                </ScrollView>
                <TextInput
                  value={part.note}
                  onChangeText={(v) => updatePart(part.key, { note: v })}
                  placeholder={t("entryForm.note")}
                  placeholderTextColor={colors.textMuted}
                  style={styles.textInput}
                  maxLength={200}
                />
              </View>
            ))}
            <Button label={t("adjustment.addPart")} variant="secondary" onPress={() => setParts((prev) => [...prev, newPart()])} />
            <Text style={[typography.body, remaining < 0 && styles.over]}>
              {remaining < 0 ? t("adjustment.exceeds") : t("adjustment.remaining", { amount: formatRupiah(remaining, lang) })}
            </Text>
          </>
        )}

        <Button label={t("adjustment.delete")} variant="danger" onPress={remove} style={styles.delete} />
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
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  card: {
    padding: spacing.md,
    gap: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  label: { marginTop: spacing.sm },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chipRow: { gap: spacing.sm },
  part: {
    padding: spacing.md,
    gap: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  partHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  link: { color: colors.expense, fontWeight: "600" },
  over: { color: colors.expense },
  textInput: {
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    fontSize: 16,
    color: colors.text,
  },
  delete: { marginTop: spacing.lg },
  footer: {
    padding: spacing.md,
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  error: { fontSize: 13, color: colors.expense },
});
