import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { getDb } from "../db/client";
import { listTransfers, type TransferWithDetails } from "../db/transfersDao";
import { useAppLanguage } from "../i18n/useAppLanguage";
import { getPeriodRange, shiftPeriod, today, type ISODate } from "../lib/dates";
import { formatDayHeader, formatMonthYear } from "../lib/dateLabels";
import { useLedgerStore } from "../store/ledgerStore";
import { spacing } from "../theme";
import { makeStyles, useTheme } from "../theme/ThemeProvider";
import type { ID } from "../types";
import type { RootStackParamList } from "../navigation/types";
import Chip from "../components/Chip";
import EmptyState from "../components/EmptyState";
import TransferRow from "../components/TransferRow";
import Fab from "../components/Fab";
import { usePagedList } from "../hooks/usePagedList";

const PAGE_SIZE = 100;
const transferKey = (t: TransferWithDetails) => String(t.id);
type Nav = NativeStackNavigationProp<RootStackParamList>;

/** Transfers as from, to, amount and fee, filterable by account and month (FR-5.6). */
export default function TransfersScreen() {
  const { colors, typography } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const lang = useAppLanguage();
  const navigation = useNavigation<Nav>();
  const accounts = useLedgerStore((s) => s.accounts);
  const dataVersion = useLedgerStore((s) => s.dataVersion);

  const todayDate = today();
  const [accountId, setAccountId] = useState<ID | null>(null);
  /** First day of the chosen month, or null for all dates. */
  const [month, setMonth] = useState<ISODate | null>(null);
  const range = useMemo(
    () => (month ? getPeriodRange("month", month) : null),
    [month],
  );

  const fetchPage = useCallback(
    async (limit: number, offset: number) =>
      listTransfers(await getDb(), { limit, offset, accountId, range }),
    [accountId, range],
  );
  const {
    items: rows,
    loading,
    loadMore,
  } = usePagedList<TransferWithDetails>({
    fetchPage,
    keyOf: transferKey,
    resetKey: `${accountId ?? "all"}:${month ?? "all"}`,
    refreshKey: dataVersion,
    pageSize: PAGE_SIZE,
  });

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
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          <Chip
            label={t("transfers.allAccounts")}
            selected={accountId === null}
            onPress={() => setAccountId(null)}
          />
          {accounts.map((a) => (
            <Chip
              key={a.id}
              label={a.name}
              selected={accountId === a.id}
              onPress={() => setAccountId(a.id)}
            />
          ))}
        </ScrollView>
        <View style={styles.monthRow}>
          <Chip
            label={t("transfers.allDates")}
            selected={month === null}
            onPress={() => setMonth(null)}
          />
          <Pressable
            onPress={() =>
              setMonth(shiftPeriod("month", month ?? currentMonth, -1))
            }
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t("summary.previous")}
          >
            <MaterialCommunityIcons
              name="chevron-left"
              size={26}
              color={colors.primary}
            />
          </Pressable>
          <Pressable
            onPress={() => setMonth(month ?? currentMonth)}
            style={styles.monthLabel}
          >
            <Text style={[typography.body, month === null && styles.muted]}>
              {formatMonthYear(month ?? currentMonth, lang)}
            </Text>
          </Pressable>
          <Pressable
            onPress={() =>
              month &&
              month < currentMonth &&
              setMonth(shiftPeriod("month", month, 1))
            }
            hitSlop={8}
            disabled={month === null || month >= currentMonth}
            accessibilityRole="button"
            accessibilityLabel={t("summary.next")}
          >
            <MaterialCommunityIcons
              name="chevron-right"
              size={26}
              color={
                month !== null && month < currentMonth
                  ? colors.primary
                  : colors.border
              }
            />
          </Pressable>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={transferKey}
          renderItem={({ item }) => (
            <TransferRow
              transfer={item}
              lang={lang}
              isUpcoming={item.occurredOn > todayDate}
              onPress={(id) =>
                navigation.navigate("TransferForm", { transferId: id })
              }
            />
          )}
          renderSectionHeader={({ section }) => (
            <Text style={[typography.label, styles.header]}>
              {formatDayHeader(section.date, todayDate, lang)}
            </Text>
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          contentContainerStyle={
            sections.length === 0 ? styles.emptyContainer : styles.listContent
          }
          ListEmptyComponent={
            <EmptyState
              icon="bank-transfer"
              title={t("transfers.emptyTitle")}
              body={t("transfers.emptyBody")}
            />
          }
        />
      )}
      <Fab
        label={t("transfers.new")}
        onPress={() =>
          navigation.navigate(
            "TransferForm",
            accountId ? { fromAccountId: accountId } : undefined,
          )
        }
      />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.background },
  filters: {
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    backgroundColor: c.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.border,
  },
  chips: { gap: spacing.sm, paddingHorizontal: spacing.md },
  monthRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  monthLabel: { flex: 1, alignItems: "center" },
  muted: { color: c.textMuted },
  loader: { marginTop: spacing.xl },
  header: {
    backgroundColor: c.background,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
    fontWeight: "600",
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: c.border,
    marginLeft: 72,
  },
  listContent: { paddingBottom: 96 },
  emptyContainer: { flexGrow: 1, justifyContent: "center" },
}));
