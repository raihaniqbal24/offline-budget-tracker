import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { getDb } from "../db/client";
import {
  getPeriodTotals,
  listEntries,
  type EntryWithDetails,
  type PeriodTotals,
} from "../db/entriesDao";
import { getBudgetProgress, type BudgetProgress } from "../db/budgetsDao";
import { useAppLanguage } from "../i18n/useAppLanguage";
import { getPeriodRange, monthKey, today } from "../lib/dates";
import { formatMonthYear } from "../lib/dateLabels";
import { formatRupiah } from "../lib/money";
import { activeAccounts, useLedgerStore } from "../store/ledgerStore";
import { radius, spacing } from "../theme";
import { makeStyles, useTheme } from "../theme/ThemeProvider";
import type { RootStackParamList } from "../navigation/types";
import EmptyState from "../components/EmptyState";
import EntryRow from "../components/EntryRow";
import BudgetBar from "../components/BudgetBar";
import { budgetLabel } from "../components/budgetLabel";
import Fab from "../components/Fab";

type Nav = NativeStackNavigationProp<RootStackParamList>;

const HIDDEN_AMOUNT = "••••••";

export default function HomeScreen() {
  const { colors, typography } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const lang = useAppLanguage();
  const navigation = useNavigation<Nav>();
  const accounts = useLedgerStore((s) => s.accounts);
  const categories = useLedgerStore((s) => s.categories);
  const dataVersion = useLedgerStore((s) => s.dataVersion);
  const pendingCount = useLedgerStore((s) => s.pendingCount);
  const totalInGoals = useLedgerStore((s) => s.totalInGoals);
  const active = useMemo(() => activeAccounts(accounts), [accounts]);
  const total = useMemo(
    () => active.reduce((sum, a) => sum + a.balance, 0),
    [active],
  );

  const todayDate = today();
  const [totals, setTotals] = useState<PeriodTotals | null>(null);
  const [recent, setRecent] = useState<EntryWithDetails[]>([]);
  const [budgets, setBudgets] = useState<BudgetProgress[]>([]);
  // Amounts in the summary card start hidden every time the app opens.
  const [amountsShown, setAmountsShown] = useState(false);
  const amount = (value: number) =>
    amountsShown ? formatRupiah(value, lang) : HIDDEN_AMOUNT;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const db = await getDb();
      const [monthTotals, latest, limits] = await Promise.all([
        getPeriodTotals(db, getPeriodRange("month", todayDate), todayDate),
        listEntries(db, { limit: 5 }),
        getBudgetProgress(db, monthKey(todayDate), todayDate),
      ]);
      if (!cancelled) {
        setTotals(monthTotals);
        setRecent(latest);
        setBudgets(limits);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dataVersion, todayDate]);

  const openEntry = (id: number) =>
    navigation.navigate("EntryForm", { entryId: id });

  // FR-7.4: limits on archived accounts or categories are hidden.
  const visibleBudgets = budgets.filter(
    (b) =>
      (b.scope !== "account" ||
        accounts.some((a) => a.id === b.accountId && !a.archived)) &&
      (b.scope !== "category" ||
        categories.some((c) => c.id === b.categoryId && !c.archived)),
  );

  if (active.length === 0) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <EmptyState
          icon="wallet-plus-outline"
          title={t("home.noAccountsTitle")}
          body={t("home.noAccountsBody")}
          actionLabel={t("accounts.add")}
          onAction={() => navigation.navigate("AccountForm")}
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
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
              {t("home.pending", { count: pendingCount })}
            </Text>
            <MaterialCommunityIcons
              name="chevron-right"
              size={22}
              color={colors.textMuted}
            />
          </Pressable>
        ) : null}

        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Text style={typography.label}>{t("home.totalInAccounts")}</Text>
            <Pressable
              onPress={() => setAmountsShown((shown) => !shown)}
              hitSlop={8}
              style={styles.inlineAction}
              accessibilityRole="button"
            >
              <MaterialCommunityIcons
                name={amountsShown ? "eye-off-outline" : "eye-outline"}
                size={18}
                color={colors.primary}
              />
              <Text style={styles.link}>
                {amountsShown ? t("home.hideAmounts") : t("home.showAmounts")}
              </Text>
            </Pressable>
          </View>
          <Text
            style={[
              typography.amountLarge,
              amountsShown && total < 0 && styles.negative,
            ]}
          >
            {amount(total)}
          </Text>

          {totalInGoals > 0 ? (
            <View style={styles.goalsRow}>
              <MaterialCommunityIcons
                name="piggy-bank-outline"
                size={16}
                color={colors.textMuted}
              />
              <Text style={typography.caption}>
                {t("home.savedInGoals", {
                  amount: formatRupiah(totalInGoals, lang),
                })}
              </Text>
            </View>
          ) : null}

          <Text style={[typography.label, styles.monthLabel]}>
            {formatMonthYear(todayDate, lang)}
          </Text>
          <View style={styles.statsRow}>
            <Stat
              label={t("home.spent")}
              value={amount(totals?.spending ?? 0)}
              color={colors.expense}
            />
            <Stat
              label={t("home.income")}
              value={amount(totals?.income ?? 0)}
              color={colors.income}
            />
            <Stat
              label={t("home.net")}
              value={amount(totals?.net ?? 0)}
              color={
                amountsShown && (totals?.net ?? 0) < 0
                  ? colors.expense
                  : colors.text
              }
            />
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={typography.title}>{t("home.accounts")}</Text>
          {active.length >= 2 ? (
            <Pressable
              onPress={() => navigation.navigate("TransferForm")}
              hitSlop={8}
              style={styles.inlineAction}
              accessibilityRole="button"
            >
              <MaterialCommunityIcons
                name="bank-transfer"
                size={18}
                color={colors.primary}
              />
              <Text style={styles.link}>{t("home.transfer")}</Text>
            </Pressable>
          ) : null}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.accountStrip}
        >
          {active.map((account) => (
            <Pressable
              key={account.id}
              onPress={() =>
                navigation.navigate("AccountForm", { accountId: account.id })
              }
              style={({ pressed }) => [
                styles.accountCard,
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
            >
              <View style={styles.accountNameRow}>
                <Text style={typography.label} numberOfLines={1}>
                  {account.name}
                </Text>
                {account.isBelowAlertLine ? (
                  <MaterialCommunityIcons
                    name="alert-circle"
                    size={16}
                    color={colors.alert}
                  />
                ) : null}
              </View>
              <Text
                style={[
                  typography.amount,
                  account.balance < 0 && styles.negative,
                ]}
                numberOfLines={1}
              >
                {formatRupiah(account.balance, lang)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.sectionHeader}>
          <Text style={typography.title}>{t("home.budgets")}</Text>
          <Pressable onPress={() => navigation.navigate("Budgets")} hitSlop={8}>
            <Text style={styles.link}>
              {visibleBudgets.length > 0
                ? t("home.manage")
                : t("home.setLimits")}
            </Text>
          </Pressable>
        </View>
        {visibleBudgets.length > 0 ? (
          <View style={styles.card}>
            {visibleBudgets.map((b) => (
              <BudgetBar
                key={b.budgetId}
                label={budgetLabel(b, accounts, categories, t)}
                spent={b.spent}
                limit={b.limit}
                percent={b.percent}
                lang={lang}
              />
            ))}
          </View>
        ) : null}

        <View style={styles.sectionHeader}>
          <Text style={typography.title}>{t("home.recent")}</Text>
          {recent.length > 0 ? (
            <Pressable
              onPress={() => navigation.navigate("Tabs", { screen: "Entries" })}
              hitSlop={8}
            >
              <Text style={styles.link}>{t("home.seeAll")}</Text>
            </Pressable>
          ) : null}
        </View>

        {recent.length === 0 ? (
          <Text style={[typography.label, styles.emptyRecent]}>
            {t("home.noEntries")}
          </Text>
        ) : (
          <View style={styles.list}>
            {recent.map((entry, index) => (
              <View key={entry.id} style={index > 0 ? styles.divider : null}>
                <EntryRow
                  entry={entry}
                  lang={lang}
                  isUpcoming={entry.occurredOn > todayDate}
                  onPress={openEntry}
                />
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <Fab
        label={t("home.quickAdd")}
        onPress={() => navigation.navigate("EntryForm")}
      />
    </View>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  const { typography } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.stat}>
      <Text style={typography.caption}>{label}</Text>
      <Text
        style={[styles.statValue, { color }]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.background },
  centered: { justifyContent: "center" },
  content: { padding: spacing.md, paddingBottom: 96, gap: spacing.md },
  card: {
    backgroundColor: c.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
  },
  negative: { color: c.expense },
  pendingCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: c.primarySoft,
  },
  flex: { flex: 1 },
  goalsRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  monthLabel: { marginTop: spacing.md },
  statsRow: { flexDirection: "row", gap: spacing.sm },
  stat: { flex: 1, gap: 2 },
  statValue: { fontSize: 15, fontWeight: "600", fontVariant: ["tabular-nums"] },
  accountStrip: { gap: spacing.sm },
  accountCard: {
    width: 160,
    padding: spacing.md,
    gap: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: c.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
  },
  accountNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  pressed: { opacity: 0.8 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  link: { color: c.primary, fontWeight: "600" },
  inlineAction: { flexDirection: "row", alignItems: "center", gap: 4 },
  emptyRecent: { textAlign: "center", paddingVertical: spacing.lg },
  list: {
    borderRadius: radius.md,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
  },
  divider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.border,
  },
}));
