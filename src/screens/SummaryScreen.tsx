import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
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
import {
  getCategoryBreakdown,
  getSpendingTrend,
  hasActivity,
  type CategorySlice,
} from "../db/summariesDao";
import { getBudgetProgress, type BudgetProgress } from "../db/budgetsDao";
import { categoryLabel } from "../i18n";
import { useAppLanguage } from "../i18n/useAppLanguage";
import {
  canGoToNextPeriod,
  getPeriodRange,
  isCurrentPeriod,
  monthKey,
  shiftPeriod,
  today,
  type ISODate,
  type PeriodType,
} from "../lib/dates";
import { monthInitial, weekdayInitial } from "../lib/dateLabels";
import { formatRupiah, formatSignedRupiah } from "../lib/money";
import {
  averagePerDay,
  buildTrend,
  compareWithPrevious,
  periodLabel,
  shareOf,
  type Comparison,
  type TrendBar,
} from "../lib/summary";
import { useLedgerStore } from "../store/ledgerStore";
import { radius, spacing } from "../theme";
import { makeStyles, useTheme } from "../theme/ThemeProvider";
import type { ID } from "../types";
import type { RootStackParamList } from "../navigation/types";
import BudgetBar from "../components/BudgetBar";
import { budgetLabel } from "../components/budgetLabel";
import CategoryIcon from "../components/CategoryIcon";
import Chip from "../components/Chip";
import EmptyState from "../components/EmptyState";
import EntryRow from "../components/EntryRow";
import Segmented from "../components/Segmented";
import StackedBar from "../components/StackedBar";
import TrendBars from "../components/TrendBars";

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface SummaryData {
  totals: PeriodTotals;
  comparison: Comparison | null; // null hides it (FR-3.9)
  breakdown: CategorySlice[];
  trend: TrendBar[];
  dayEntries: EntryWithDetails[];
  budgets: BudgetProgress[];
}

const PERIODS: PeriodType[] = ["day", "week", "month", "year"];

/**
 * Period summaries (FR-3.1 to FR-3.9). Opens on Month (FR-3.2). Totals leave
 * out future-dated entries until their date, and transfers entirely, but
 * include transfer fees and unrecorded adjustments.
 */
export default function SummaryScreen() {
  const { colors, typography } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const lang = useAppLanguage();
  const navigation = useNavigation<Nav>();
  const accounts = useLedgerStore((s) => s.accounts);
  const categories = useLedgerStore((s) => s.categories);
  const dataVersion = useLedgerStore((s) => s.dataVersion);

  const todayDate = today();
  const [type, setType] = useState<PeriodType>("month");
  const [anchor, setAnchor] = useState<ISODate>(todayDate);
  const [accountId, setAccountId] = useState<ID | null>(null);
  const [data, setData] = useState<SummaryData | null>(null);

  const range = useMemo(() => getPeriodRange(type, anchor), [type, anchor]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const db = await getDb();
      const previous = getPeriodRange(type, shiftPeriod(type, anchor, -1));
      const [
        totals,
        prevTotals,
        prevActive,
        breakdown,
        trendData,
        dayEntries,
        budgets,
      ] = await Promise.all([
        getPeriodTotals(db, range, todayDate, accountId),
        getPeriodTotals(db, previous, todayDate, accountId),
        hasActivity(db, previous, todayDate, accountId),
        getCategoryBreakdown(db, range, todayDate, accountId),
        type === "day"
          ? Promise.resolve(new Map<string, number>())
          : getSpendingTrend(
              db,
              range,
              todayDate,
              type === "year" ? "month" : "day",
              accountId,
            ),
        type === "day" && range.start <= todayDate
          ? listEntries(db, { limit: 500, range, accountId })
          : Promise.resolve([] as EntryWithDetails[]),
        // FR-7.4: limits in force for the month shown, so past months keep theirs.
        type === "month"
          ? getBudgetProgress(db, monthKey(range.start), todayDate)
          : Promise.resolve([]),
      ]);
      if (cancelled) return;
      setData({
        totals,
        comparison: prevActive
          ? compareWithPrevious(totals.spending, prevTotals.spending)
          : null,
        breakdown,
        trend: buildTrend(type, range, trendData),
        dayEntries,
        // With an account filter, only that account's own limit applies.
        budgets:
          accountId === null
            ? budgets
            : budgets.filter(
                (b) => b.scope === "account" && b.accountId === accountId,
              ),
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [type, anchor, range, accountId, dataVersion, todayDate]);

  const changeType = (next: PeriodType) => {
    setType(next);
    setAnchor(todayDate); // each view starts on the current period
  };

  const isCurrent = isCurrentPeriod(type, anchor, todayDate);
  const canGoNext = canGoToNextPeriod(type, anchor, todayDate);
  const isEmpty =
    data !== null && data.totals.spending === 0 && data.totals.income === 0;

  const axisLabel = (bar: TrendBar, index: number): string | null => {
    if (type === "year") return monthInitial(bar.key, lang);
    if (type === "week") return weekdayInitial(bar.key, lang);
    // Month: label the 1st, 8th, 15th, 22nd and 29th.
    return index % 7 === 0 ? String(index + 1) : null;
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Segmented
        options={PERIODS.map((p) => ({ value: p, label: t(`summary.${p}`) }))}
        value={type}
        onChange={changeType}
      />

      <View style={styles.navRow}>
        <Pressable
          onPress={() => setAnchor(shiftPeriod(type, anchor, -1))}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t("summary.previous")}
        >
          <MaterialCommunityIcons
            name="chevron-left"
            size={30}
            color={colors.primary}
          />
        </Pressable>
        <Text style={[typography.title, styles.navLabel]} numberOfLines={1}>
          {periodLabel(type, range, todayDate, lang)}
        </Text>
        <Pressable
          onPress={() => canGoNext && setAnchor(shiftPeriod(type, anchor, 1))}
          disabled={!canGoNext}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t("summary.next")}
          accessibilityState={{ disabled: !canGoNext }}
        >
          <MaterialCommunityIcons
            name="chevron-right"
            size={30}
            color={canGoNext ? colors.primary : colors.border}
          />
        </Pressable>
      </View>
      {!isCurrent ? (
        <Pressable
          onPress={() => setAnchor(todayDate)}
          style={styles.todayLink}
          hitSlop={8}
        >
          <Text style={styles.link}>{t("summary.backToToday")}</Text>
        </Pressable>
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        <Chip
          label={t("summary.allAccounts")}
          selected={accountId === null}
          onPress={() => setAccountId(null)}
        />
        {accounts
          .filter((a) => !a.archived || a.id === accountId)
          .map((a) => (
            <Chip
              key={a.id}
              label={a.name}
              selected={accountId === a.id}
              onPress={() => setAccountId(a.id)}
            />
          ))}
      </ScrollView>

      {data === null ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : (
        <>
          <View style={styles.card}>
            <Text style={typography.label}>{t("summary.spent")}</Text>
            <Text style={[typography.amountLarge, { color: colors.expense }]}>
              {formatRupiah(data.totals.spending, lang)}
            </Text>
            {data.comparison ? (
              <ComparisonLine comparison={data.comparison} type={type} />
            ) : null}

            <View style={styles.statsRow}>
              <Stat
                label={t("summary.income")}
                value={formatRupiah(data.totals.income, lang)}
                color={colors.income}
              />
              <Stat
                label={t("summary.net")}
                value={formatSignedRupiah(data.totals.net, lang)}
                color={data.totals.net < 0 ? colors.expense : colors.text}
              />
              {type !== "day" ? (
                <Stat
                  label={t("summary.averagePerDay")}
                  value={formatRupiah(
                    averagePerDay(data.totals.spending, range, todayDate),
                    lang,
                  )}
                  color={colors.text}
                />
              ) : null}
            </View>
          </View>

          {data.budgets.length > 0 ? (
            <View style={styles.card}>
              <Text style={typography.title}>{t("summary.budgets")}</Text>
              {data.budgets.map((b) => (
                <BudgetBar
                  key={b.budgetId}
                  label={budgetLabel(b, accounts, categories, t)}
                  spent={b.spent}
                  limit={b.limit}
                  percent={b.percent}
                  lang={lang}
                  onPress={
                    isCurrent
                      ? () =>
                          navigation.navigate("BudgetForm", {
                            scope: b.scope,
                            categoryId: b.categoryId ?? undefined,
                            accountId: b.accountId ?? undefined,
                          })
                      : undefined
                  }
                />
              ))}
            </View>
          ) : null}

          {isEmpty ? (
            <EmptyState
              icon="calendar-blank-outline"
              title={t("summary.emptyTitle")}
              body={t("summary.emptyBody")}
              actionLabel={t("summary.addEntry")}
              onAction={() => navigation.navigate("EntryForm")}
            />
          ) : (
            <>
              {data.breakdown.length > 0 ? (
                <View style={styles.card}>
                  <Text style={typography.title}>{t("summary.breakdown")}</Text>
                  <StackedBar
                    slices={data.breakdown.map((s) => ({
                      key: s.categoryId,
                      value: s.amount,
                      color: s.color,
                    }))}
                  />
                  {data.breakdown.map((slice) => (
                    <BreakdownRow
                      key={slice.categoryId}
                      slice={slice}
                      share={shareOf(slice.amount, data.totals.spending)}
                      amount={formatRupiah(slice.amount, lang)}
                      onPress={
                        slice.builtinKey === "unrecorded"
                          ? () =>
                              navigation.navigate("Adjustments", {
                                start: range.start,
                                end:
                                  range.end < todayDate ? range.end : todayDate,
                                accountId,
                              })
                          : undefined
                      }
                    />
                  ))}
                </View>
              ) : (
                <Text style={[typography.label, styles.centerText]}>
                  {t("summary.noSpending")}
                </Text>
              )}

              {type !== "day" ? (
                <View style={styles.card}>
                  <Text style={typography.title}>{t("summary.trend")}</Text>
                  <TrendBars
                    bars={data.trend}
                    labelFor={axisLabel}
                    highlightKey={
                      type === "year" ? todayDate.slice(0, 7) : todayDate
                    }
                  />
                </View>
              ) : (
                <View style={styles.list}>
                  {data.dayEntries.map((entry, i) => (
                    <View key={entry.id} style={i > 0 ? styles.divider : null}>
                      <EntryRow
                        entry={entry}
                        lang={lang}
                        isUpcoming={false}
                        onPress={(id) =>
                          entry.type === "adjustment"
                            ? navigation.navigate("Adjustment", { entryId: id })
                            : navigation.navigate("EntryForm", { entryId: id })
                        }
                      />
                    </View>
                  ))}
                </View>
              )}
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}

function ComparisonLine({
  comparison,
  type,
}: {
  comparison: Comparison;
  type: PeriodType;
}) {
  const { colors, typography } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const lang = useAppLanguage();
  const up = comparison.change > 0;
  const color =
    comparison.change === 0
      ? colors.textMuted
      : up
        ? colors.expense
        : colors.income;
  const pct =
    comparison.percent === null
      ? ""
      : ` (${comparison.percent > 0 ? "+" : ""}${comparison.percent}%)`;
  return (
    <View style={styles.comparison}>
      <MaterialCommunityIcons
        name={
          comparison.change === 0 ? "minus" : up ? "arrow-up" : "arrow-down"
        }
        size={16}
        color={color}
      />
      <Text style={[typography.label, { color }]}>
        {formatSignedRupiah(comparison.change, lang)}
        {pct} {t(`summary.vsPrevious.${type}`)}
      </Text>
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

function BreakdownRow({
  slice,
  share,
  amount,
  onPress,
}: {
  slice: CategorySlice;
  share: number;
  amount: string;
  onPress?: () => void;
}) {
  const { colors, typography } = useTheme();
  const styles = useStyles();
  const content = (
    <>
      <CategoryIcon icon={slice.icon} color={slice.color} size={32} />
      <View style={styles.rowMiddle}>
        <Text style={typography.body} numberOfLines={1}>
          {categoryLabel(slice)}
        </Text>
        <View style={styles.shareTrack}>
          <View
            style={[
              styles.shareFill,
              { width: `${share}%`, backgroundColor: slice.color },
            ]}
          />
        </View>
      </View>
      <View style={styles.rowRight}>
        <Text style={typography.amount}>{amount}</Text>
        <Text style={typography.caption}>{share}%</Text>
      </View>
      {onPress ? (
        <MaterialCommunityIcons
          name="chevron-right"
          size={20}
          color={colors.textMuted}
        />
      ) : null}
    </>
  );
  return onPress ? (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole="button"
    >
      {content}
    </Pressable>
  ) : (
    <View style={styles.row}>{content}</View>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.background },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  navLabel: { flex: 1, textAlign: "center" },
  todayLink: { alignSelf: "center", marginTop: -spacing.sm },
  link: { color: c.primary, fontWeight: "600" },
  chips: { gap: spacing.sm },
  loader: { marginTop: spacing.xl },
  card: {
    padding: spacing.md,
    gap: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: c.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
  },
  comparison: { flexDirection: "row", alignItems: "center", gap: 4 },
  statsRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  stat: { flex: 1, gap: 2 },
  statValue: { fontSize: 15, fontWeight: "600", fontVariant: ["tabular-nums"] },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  pressed: { opacity: 0.7 },
  rowMiddle: { flex: 1, gap: 4 },
  rowRight: { alignItems: "flex-end" },
  shareTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: c.background,
    overflow: "hidden",
  },
  shareFill: { height: 4, borderRadius: 2 },
  centerText: { textAlign: "center" },
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
