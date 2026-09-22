import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, SectionList, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { getDb } from "../db/client";
import { listTransfers, type TransferWithDetails } from "../db/transfersDao";
import { useAppLanguage } from "../i18n/useAppLanguage";
import { getPeriodRange, shiftPeriod, today, type ISODate } from "../lib/dates";
import { formatDayHeader, formatMonthYear } from "../lib/dateLabels";
import { formatRupiah, type AppLanguage } from "../lib/money";
import { useLedgerStore } from "../store/ledgerStore";
import { colors, spacing, typography } from "../theme";
import type { ID } from "../types";
import type { RootStackParamList } from "../navigation/types";
import Chip from "../components/Chip";
import EmptyState from "../components/EmptyState";
import Fab from "../components/Fab";

const PAGE_SIZE = 100;
type Nav = NativeStackNavigationProp<RootStackParamList>;

/** Transfers as from, to, amount and fee, filterable by account and month (FR-5.6). */
export default function TransfersScreen() {
  const { t } = useTranslation();
  const lang = useAppLanguage();
  const navigation = useNavigation<Nav>();
  const accounts = useLedgerStore((s) => s.accounts);
  const dataVersion = useLedgerStore((s) => s.dataVersion);

  const todayDate = today();
  const [accountId, setAccountId] = useState<ID | null>(null);
  /** First day of the chosen month, or null for all dates. */
  const [month, setMonth] = useState<ISODate | null>(null);
  const [rows, setRows] = useState<TransferWithDetails[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const loaded = useRef(0);
  const busy = useRef(false);

  const range = useMemo(() => (month ? getPeriodRange("month", month) : null), [month]);

  // A new filter starts from the first page. Declared before the load effect
  // so it runs first when the filter changes.
  useEffect(() => {
    loaded.current = 0;
  }, [accountId, range]);

  // After any write, reload what is already on screen so the scroll position holds.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const db = await getDb();
      const limit = Math.max(PAGE_SIZE, loaded.current);
      const result = await listTransfers(db, { limit, accountId, range });
      if (cancelled) return;
      loaded.current = result.length;
      setRows(result);
      setHasMore(result.length === limit);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [dataVersion, accountId, range]);

  const loadMore = useCallback(async () => {
    if (!hasMore || busy.current) return;
    busy.current = true;
    const db = await getDb();
    const more = await listTransfers(db, { limit: PAGE_SIZE, offset: loaded.current, accountId, range });
    loaded.current += more.length;
    setRows((prev) => [...prev, ...more]);
    setHasMore(more.length === PAGE_SIZE);
    busy.current = false;
  }, [hasMore, accountId, range]);

  const sections = useMemo(() => {
    const out: { date: string; data: TransferWithDetails[] }[] = [];
    for (const row of rows) {
      const last = out[out.length - 1];
      if (last && last.date === row.occurredOn) last.data.push(row);
      else out.push({ date: row.occurredOn, data: [row] });
    }
    return out;
  }, [rows]);

  const currentMonth = getPeriodRange("month", todayDate).start;

  return (
    <View style={styles.screen}>
      <View style={styles.filters}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip label={t("transfers.allAccounts")} selected={accountId === null} onPress={() => setAccountId(null)} />
          {accounts.map((a) => (
            <Chip key={a.id} label={a.name} selected={accountId === a.id} onPress={() => setAccountId(a.id)} />
          ))}
        </ScrollView>
        <View style={styles.monthRow}>
          <Chip label={t("transfers.allDates")} selected={month === null} onPress={() => setMonth(null)} />
          <Pressable
            onPress={() => setMonth(shiftPeriod("month", month ?? currentMonth, -1))}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t("summary.previous")}
          >
            <MaterialCommunityIcons name="chevron-left" size={26} color={colors.primary} />
          </Pressable>
          <Pressable onPress={() => setMonth(month ?? currentMonth)} style={styles.monthLabel}>
            <Text style={[typography.body, month === null && styles.muted]}>
              {formatMonthYear(month ?? currentMonth, lang)}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => month && month < currentMonth && setMonth(shiftPeriod("month", month, 1))}
            hitSlop={8}
            disabled={month === null || month >= currentMonth}
            accessibilityRole="button"
            accessibilityLabel={t("summary.next")}
          >
            <MaterialCommunityIcons
              name="chevron-right"
              size={26}
              color={month !== null && month < currentMonth ? colors.primary : colors.border}
            />
          </Pressable>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <TransferRow
              transfer={item}
              lang={lang}
              isUpcoming={item.occurredOn > todayDate}
              onPress={() => navigation.navigate("TransferForm", { transferId: item.id })}
            />
          )}
          renderSectionHeader={({ section }) => (
            <Text style={[typography.label, styles.header]}>{formatDayHeader(section.date, todayDate, lang)}</Text>
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          contentContainerStyle={sections.length === 0 ? styles.emptyContainer : styles.listContent}
          ListEmptyComponent={
            <EmptyState icon="bank-transfer" title={t("transfers.emptyTitle")} body={t("transfers.emptyBody")} />
          }
        />
      )}
      <Fab label={t("transfers.new")} onPress={() => navigation.navigate("TransferForm", accountId ? { fromAccountId: accountId } : undefined)} />
    </View>
  );
}

function TransferRow({
  transfer,
  lang,
  isUpcoming,
  onPress,
}: {
  transfer: TransferWithDetails;
  lang: AppLanguage;
  isUpcoming: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const payer = transfer.feePaidBy === "sender" ? t("transfers.payerSender") : t("transfers.payerRecipient");
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]} accessibilityRole="button">
      <View style={styles.iconCircle}>
        <MaterialCommunityIcons name="bank-transfer" size={20} color={colors.transfer} />
      </View>
      <View style={styles.middle}>
        <Text style={typography.body} numberOfLines={1}>
          {transfer.fromAccountName} → {transfer.toAccountName}
        </Text>
        {transfer.note || isUpcoming ? (
          <Text style={typography.caption} numberOfLines={1}>
            {[isUpcoming ? t("entries.upcoming") : null, transfer.note].filter(Boolean).join(" · ")}
          </Text>
        ) : null}
      </View>
      <View style={styles.right}>
        <Text style={[typography.amount, { color: colors.transfer }]}>{formatRupiah(transfer.amount, lang)}</Text>
        {transfer.fee > 0 ? (
          <Text style={typography.caption}>
            {t("transfers.feeCaption", { amount: formatRupiah(transfer.fee, lang), payer })}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  filters: {
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  chips: { gap: spacing.sm, paddingHorizontal: spacing.md },
  monthRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md },
  monthLabel: { flex: 1, alignItems: "center" },
  muted: { color: colors.textMuted },
  loader: { marginTop: spacing.xl },
  header: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
    fontWeight: "600",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    backgroundColor: colors.surface,
  },
  pressed: { backgroundColor: colors.primarySoft },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: `${colors.transfer}22`,
  },
  middle: { flex: 1, gap: 2 },
  right: { alignItems: "flex-end", gap: 2 },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 72 },
  listContent: { paddingBottom: 96 },
  emptyContainer: { flexGrow: 1, justifyContent: "center" },
});