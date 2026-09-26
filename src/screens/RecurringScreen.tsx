import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { getDb } from "../db/client";
import { listRules } from "../db/recurringDao";
import { categoryLabel } from "../i18n";
import { useAppLanguage } from "../i18n/useAppLanguage";
import { today } from "../lib/dates";
import { formatDate } from "../lib/dateLabels";
import { formatRupiah } from "../lib/money";
import { useLedgerStore } from "../store/ledgerStore";
import { radius, spacing } from "../theme";
import { makeStyles, useTheme } from "../theme/ThemeProvider";
import type { RecurringRule } from "../types";
import type { RootStackParamList } from "../navigation/types";
import Button from "../components/Button";
import EmptyState from "../components/EmptyState";

type Props = NativeStackScreenProps<RootStackParamList, "Recurring">;

/** Recurring rules (FR-11.1). Occurrences appear as pending entries to confirm. */
export default function RecurringScreen({ navigation }: Props) {
  const { colors, typography } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const lang = useAppLanguage();
  const accounts = useLedgerStore((s) => s.accounts);
  const categories = useLedgerStore((s) => s.categories);
  const dataVersion = useLedgerStore((s) => s.dataVersion);
  const pendingCount = useLedgerStore((s) => s.pendingCount);
  const [rules, setRules] = useState<RecurringRule[] | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const all = await listRules(await getDb());
      if (!cancelled) setRules(all);
    })();
    return () => {
      cancelled = true;
    };
  }, [dataVersion]);

  const { active, archived } = useMemo(
    () => ({
      active: (rules ?? []).filter((r) => !r.archived),
      archived: (rules ?? []).filter((r) => r.archived),
    }),
    [rules],
  );

  if (rules === null)
    return <ActivityIndicator style={styles.loader} color={colors.primary} />;

  const describe = (rule: RecurringRule) => {
    const account = accounts.find((a) => a.id === rule.accountId)?.name ?? "";
    if (rule.type === "transfer") {
      const to = accounts.find((a) => a.id === rule.toAccountId)?.name ?? "";
      return `${account} → ${to}`;
    }
    const category = categories.find((c) => c.id === rule.categoryId);
    return `${category ? categoryLabel(category) : ""} · ${account}`;
  };

  const row = (rule: RecurringRule) => (
    <Pressable
      key={rule.id}
      onPress={() => navigation.navigate("RecurringForm", { ruleId: rule.id })}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole="button"
    >
      <MaterialCommunityIcons
        name={
          rule.type === "transfer"
            ? "bank-transfer"
            : rule.type === "income"
              ? "cash-plus"
              : "cash-minus"
        }
        size={24}
        color={
          rule.archived
            ? colors.textMuted
            : rule.type === "income"
              ? colors.income
              : colors.primary
        }
      />
      <View style={styles.rowMiddle}>
        <Text style={typography.body} numberOfLines={1}>
          {rule.note?.trim() || describe(rule)}
        </Text>
        <Text style={typography.caption} numberOfLines={1}>
          {t(`recurring.every.${rule.frequency}`)} ·{" "}
          {t("recurring.since", {
            date: formatDate(rule.startDate, lang, { todayDate: today() }),
          })}
          {rule.endDate
            ? ` · ${t("recurring.until", { date: formatDate(rule.endDate, lang, { todayDate: today() }) })}`
            : ""}
        </Text>
      </View>
      <Text style={typography.amount}>{formatRupiah(rule.amount, lang)}</Text>
    </Pressable>
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {pendingCount > 0 ? (
        <Pressable
          onPress={() => navigation.navigate("Pending")}
          style={({ pressed }) => [
            styles.pendingCard,
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
        >
          <MaterialCommunityIcons
            name="calendar-clock"
            size={22}
            color={colors.primary}
          />
          <Text style={[typography.body, styles.flex]}>
            {t("recurring.pendingCount", { count: pendingCount })}
          </Text>
          <MaterialCommunityIcons
            name="chevron-right"
            size={22}
            color={colors.textMuted}
          />
        </Pressable>
      ) : null}

      {active.length === 0 ? (
        <EmptyState
          icon="calendar-sync-outline"
          title={t("recurring.emptyTitle")}
          body={t("recurring.emptyBody")}
        />
      ) : (
        <View style={styles.group}>{active.map(row)}</View>
      )}

      <Button
        label={t("recurring.add")}
        variant="secondary"
        onPress={() => navigation.navigate("RecurringForm")}
      />

      {archived.length > 0 ? (
        <>
          <Pressable
            onPress={() => setShowArchived((v) => !v)}
            style={styles.toggle}
            hitSlop={8}
          >
            <Text style={styles.link}>
              {showArchived
                ? t("recurring.hideArchived")
                : t("recurring.showArchived", { count: archived.length })}
            </Text>
          </Pressable>
          {showArchived ? (
            <View style={styles.group}>{archived.map(row)}</View>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.background },
  loader: { marginTop: spacing.xl },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  pendingCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: c.primarySoft,
  },
  group: {
    backgroundColor: c.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.border,
  },
  pressed: { backgroundColor: c.primarySoft },
  rowMiddle: { flex: 1, gap: 2 },
  flex: { flex: 1 },
  toggle: { alignSelf: "center", padding: spacing.sm },
  link: { color: c.primary, fontWeight: "600" },
}));
