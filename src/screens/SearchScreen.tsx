import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { getDb } from "../db/client";
import {
  EMPTY_FILTERS,
  hasActiveFilters,
  searchRecords,
  summarizeSearch,
  type SearchFilters,
  type SearchRow,
  type SearchSummary,
  type SearchType,
} from "../db/searchDao";
import { categoryLabel } from "../i18n";
import { useAppLanguage } from "../i18n/useAppLanguage";
import { parseISODate, toISODate, today, type ISODate } from "../lib/dates";
import { formatDate } from "../lib/dateLabels";
import { formatRupiah, parseAmount } from "../lib/money";
import { useLedgerStore } from "../store/ledgerStore";
import { colors, radius, spacing, typography } from "../theme";
import type { ID } from "../types";
import type { RootStackParamList } from "../navigation/types";
import AmountInput from "../components/AmountInput";
import Chip from "../components/Chip";
import EmptyState from "../components/EmptyState";
import EntryRow from "../components/EntryRow";
import Segmented from "../components/Segmented";
import TransferRow from "../components/TransferRow";
import { usePagedList } from "../hooks/usePagedList";

type Props = NativeStackScreenProps<RootStackParamList, "Search">;

const PAGE_SIZE = 100;
const TYPES: SearchType[] = ["expense", "income", "transfer", "adjustment"];

const rowKey = (r: SearchRow) =>
  r.kind === "entry" ? `e${r.entry.id}` : `t${r.transfer.id}`;

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value)
    ? list.filter((v) => v !== value)
    : [...list, value];
}

/**
 * Search and filter (FR-8). With no filters it lists everything; every
 * active filter narrows the list further (they combine), and the header
 * shows the count with spending and income kept separate (decided).
 */
export default function SearchScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const lang = useAppLanguage();
  const accounts = useLedgerStore((s) => s.accounts);
  const categories = useLedgerStore((s) => s.categories);
  const dataVersion = useLedgerStore((s) => s.dataVersion);
  const todayDate = today();

  // Raw form state
  const [text, setText] = useState("");
  const [debouncedText, setDebouncedText] = useState("");
  const [amountMode, setAmountMode] = useState<"exact" | "range">("exact");
  const [exactText, setExactText] = useState("");
  const [minText, setMinText] = useState("");
  const [maxText, setMaxText] = useState("");
  const [accountId, setAccountId] = useState<ID | null>(null);
  const [categoryIds, setCategoryIds] = useState<ID[]>([]);
  const [types, setTypes] = useState<SearchType[]>([]);
  const [startDate, setStartDate] = useState<ISODate | null>(null);
  const [endDate, setEndDate] = useState<ISODate | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const [summary, setSummary] = useState<SearchSummary | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedText(text), 300);
    return () => clearTimeout(timer);
  }, [text]);

  const amountBounds = useMemo(() => {
    if (amountMode === "exact") {
      const v = exactText.trim() === "" ? null : parseAmount(exactText);
      return { min: v, max: v, invalid: exactText.trim() !== "" && v === null };
    }
    const min = minText.trim() === "" ? null : parseAmount(minText);
    const max = maxText.trim() === "" ? null : parseAmount(maxText);
    return {
      min,
      max,
      invalid:
        (minText.trim() !== "" && min === null) ||
        (maxText.trim() !== "" && max === null),
    };
  }, [amountMode, exactText, minText, maxText]);

  const filters = useMemo<SearchFilters>(
    () => ({
      text: debouncedText,
      minAmount: amountBounds.min,
      maxAmount: amountBounds.max,
      accountId,
      categoryIds,
      types,
      startDate,
      endDate,
    }),
    [
      debouncedText,
      amountBounds.min,
      amountBounds.max,
      accountId,
      categoryIds,
      types,
      startDate,
      endDate,
    ],
  );

  const filterKey = JSON.stringify(filters);

  const fetchPage = useCallback(
    async (limit: number, offset: number) =>
      searchRecords(await getDb(), filters, { limit, offset }),
    [filters],
  );
  const { items: rows, loadMore } = usePagedList<SearchRow>({
    fetchPage,
    keyOf: rowKey,
    resetKey: filterKey,
    refreshKey: dataVersion,
    pageSize: PAGE_SIZE,
  });

  // Count and totals for the header (FR-8.3).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const totals = await summarizeSearch(await getDb(), filters);
      if (!cancelled) setSummary(totals);
    })();
    return () => {
      cancelled = true;
    };
    // filters is captured through filterKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, dataVersion]);

  // FR-8.4: clearing restores the full list.
  const clearAll = () => {
    setText("");
    setDebouncedText("");
    setExactText("");
    setMinText("");
    setMaxText("");
    setAccountId(null);
    setCategoryIds([]);
    setTypes([]);
    setStartDate(null);
    setEndDate(null);
  };

  const pickDate = (current: ISODate | null, onPick: (d: ISODate) => void) => {
    DateTimePickerAndroid.open({
      value: parseISODate(current ?? todayDate),
      mode: "date",
      onChange: (event, date) => {
        if (event.type === "set" && date) onPick(toISODate(date));
      },
    });
  };

  const active = hasActiveFilters(filters);
  const filterCount =
    (amountBounds.min !== null || amountBounds.max !== null ? 1 : 0) +
    (accountId !== null ? 1 : 0) +
    (categoryIds.length > 0 ? 1 : 0) +
    (types.length > 0 ? 1 : 0) +
    (startDate !== null || endDate !== null ? 1 : 0);

  const expenseCats = categories.filter(
    (c) => c.type === "expense" && c.builtinKey === null,
  );
  const incomeCats = categories.filter(
    (c) => c.type === "income" && c.builtinKey === null,
  );

  const header = (
    <View style={styles.header}>
      <View style={styles.searchBox}>
        <MaterialCommunityIcons
          name="magnify"
          size={22}
          color={colors.textMuted}
        />
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={t("search.notePlaceholder")}
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
          autoFocus
          returnKeyType="search"
        />
        {text ? (
          <Pressable
            onPress={() => setText("")}
            hitSlop={8}
            accessibilityLabel={t("search.clearText")}
          >
            <MaterialCommunityIcons
              name="close-circle"
              size={20}
              color={colors.textMuted}
            />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.toolbar}>
        <Pressable
          onPress={() => setShowFilters((v) => !v)}
          style={styles.filterToggle}
          hitSlop={6}
        >
          <MaterialCommunityIcons
            name="filter-variant"
            size={20}
            color={colors.primary}
          />
          <Text style={styles.link}>
            {filterCount > 0
              ? t("search.filtersCount", { count: filterCount })
              : t("search.filters")}
          </Text>
          <MaterialCommunityIcons
            name={showFilters ? "chevron-up" : "chevron-down"}
            size={20}
            color={colors.primary}
          />
        </Pressable>
        {active ? (
          <Pressable onPress={clearAll} hitSlop={6}>
            <Text style={styles.link}>{t("search.clearAll")}</Text>
          </Pressable>
        ) : null}
      </View>

      {showFilters ? (
        <View style={styles.panel}>
          <Text style={typography.label}>{t("search.type")}</Text>
          <View style={styles.wrap}>
            {TYPES.map((type) => (
              <Chip
                key={type}
                label={t(`search.types.${type}`)}
                selected={types.includes(type)}
                onPress={() => setTypes((v) => toggle(v, type))}
              />
            ))}
          </View>

          <Text style={[typography.label, styles.label]}>
            {t("search.account")}
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            <Chip
              label={t("summary.allAccounts")}
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

          <Text style={[typography.label, styles.label]}>
            {t("search.categories")}
          </Text>
          {[expenseCats, incomeCats].map((list, i) => (
            <ScrollView
              key={i}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
            >
              {list.map((c) => (
                <Chip
                  key={c.id}
                  label={
                    c.archived
                      ? `${categoryLabel(c)} ${t("entryForm.archivedSuffix")}`
                      : categoryLabel(c)
                  }
                  icon={c.icon}
                  color={c.color}
                  selected={categoryIds.includes(c.id)}
                  onPress={() => setCategoryIds((v) => toggle(v, c.id))}
                />
              ))}
            </ScrollView>
          ))}

          <Text style={[typography.label, styles.label]}>
            {t("search.amount")}
          </Text>
          <Segmented
            options={[
              { value: "exact", label: t("search.exact") },
              { value: "range", label: t("search.range") },
            ]}
            value={amountMode}
            onChange={setAmountMode}
          />
          {amountMode === "exact" ? (
            <AmountInput
              value={exactText}
              onChangeText={setExactText}
              lang={lang}
            />
          ) : (
            <View style={styles.rangeRow}>
              <View style={styles.flex}>
                <Text style={typography.caption}>{t("search.from")}</Text>
                <AmountInput
                  value={minText}
                  onChangeText={setMinText}
                  lang={lang}
                />
              </View>
              <View style={styles.flex}>
                <Text style={typography.caption}>{t("search.to")}</Text>
                <AmountInput
                  value={maxText}
                  onChangeText={setMaxText}
                  lang={lang}
                />
              </View>
            </View>
          )}
          {amountBounds.invalid ? (
            <Text style={styles.error}>{t("amount.invalid")}</Text>
          ) : null}

          <Text style={[typography.label, styles.label]}>
            {t("search.dates")}
          </Text>
          <View style={styles.wrap}>
            <Chip
              label={
                startDate
                  ? `${t("search.from")} ${formatDate(startDate, lang, { todayDate })}`
                  : t("search.fromAny")
              }
              icon="calendar"
              selected={startDate !== null}
              onPress={() => pickDate(startDate, setStartDate)}
            />
            <Chip
              label={
                endDate
                  ? `${t("search.to")} ${formatDate(endDate, lang, { todayDate })}`
                  : t("search.toAny")
              }
              icon="calendar"
              selected={endDate !== null}
              onPress={() => pickDate(endDate, setEndDate)}
            />
            {startDate || endDate ? (
              <Chip
                label={t("search.anyDate")}
                onPress={() => {
                  setStartDate(null);
                  setEndDate(null);
                }}
              />
            ) : null}
          </View>
        </View>
      ) : null}

      {summary ? (
        <View style={styles.summary}>
          <Text style={typography.body}>
            {t("search.resultCount", { count: summary.count })}
          </Text>
          <View style={styles.summaryRow}>
            <Text style={[typography.label, { color: colors.expense }]}>
              {t("search.spent", {
                amount: formatRupiah(summary.spending, lang),
              })}
            </Text>
            <Text style={[typography.label, { color: colors.income }]}>
              {t("search.income", {
                amount: formatRupiah(summary.income, lang),
              })}
            </Text>
          </View>
          {summary.transferCount > 0 ? (
            <Text style={typography.caption}>
              {t("search.transfers", {
                count: summary.transferCount,
                fees: formatRupiah(summary.transferFees, lang),
              })}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );

  return (
    <FlatList
      style={styles.screen}
      data={rows}
      keyExtractor={rowKey}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={header}
      renderItem={({ item }) =>
        item.kind === "entry" ? (
          <EntryRow
            entry={item.entry}
            lang={lang}
            isUpcoming={item.entry.occurredOn > todayDate}
            onPress={(id) => navigation.navigate("EntryForm", { entryId: id })}
          />
        ) : (
          <TransferRow
            transfer={item.transfer}
            lang={lang}
            isUpcoming={item.transfer.occurredOn > todayDate}
            onPress={(id) =>
              navigation.navigate("TransferForm", { transferId: id })
            }
          />
        )
      }
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      onEndReached={loadMore}
      onEndReachedThreshold={0.5}
      ListEmptyComponent={
        summary === null ? (
          <ActivityIndicator style={styles.loader} color={colors.primary} />
        ) : (
          <EmptyState icon="magnify" title={t("search.noResults")} />
        )
      }
      contentContainerStyle={styles.listContent}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  loader: { marginTop: spacing.xl },
  header: { padding: spacing.md, gap: spacing.sm },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  searchInput: { flex: 1, fontSize: 16, color: colors.text },
  toolbar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  filterToggle: { flexDirection: "row", alignItems: "center", gap: 4 },
  link: { color: colors.primary, fontWeight: "600" },
  panel: {
    padding: spacing.md,
    gap: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  label: { marginTop: spacing.sm },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chipRow: { gap: spacing.sm },
  rangeRow: { flexDirection: "row", gap: spacing.sm },
  flex: { flex: 1, gap: 4 },
  error: { fontSize: 13, color: colors.expense },
  summary: { gap: 2, paddingTop: spacing.sm },
  summaryRow: { flexDirection: "row", gap: spacing.md, flexWrap: "wrap" },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: 72,
  },
  listContent: { paddingBottom: spacing.xl },
});
