import { useCallback, useLayoutEffect, useMemo } from "react";
import {
  ActivityIndicator,
  Pressable,
  SectionList,
  StyleSheet,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTranslation } from "react-i18next";
import { getDb } from "../db/client";
import { listEntries, type EntryWithDetails } from "../db/entriesDao";
import { useAppLanguage } from "../i18n/useAppLanguage";
import { today } from "../lib/dates";
import { groupByDay } from "../lib/daySections";
import { useLedgerStore } from "../store/ledgerStore";
import { spacing } from "../theme";
import { makeStyles, useTheme } from "../theme/ThemeProvider";
import type { RootStackParamList } from "../navigation/types";
import DayHeader from "../components/DayHeader";
import EmptyState from "../components/EmptyState";
import EntryRow, { signedAmount } from "../components/EntryRow";
import Fab from "../components/Fab";
import { usePagedList } from "../hooks/usePagedList";

const PAGE_SIZE = 100;
const entryKey = (e: EntryWithDetails) => String(e.id);

type Nav = NativeStackNavigationProp<RootStackParamList>;

const entryDate = (e: EntryWithDetails) => e.occurredOn;

/** All entries, newest first, grouped by day and loaded 100 at a time. */
export default function EntriesScreen() {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const lang = useAppLanguage();
  const navigation = useNavigation<Nav>();
  const dataVersion = useLedgerStore((s) => s.dataVersion);

  // FR-8: search and filters open from the list header.
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={() => navigation.navigate("Search")}
          hitSlop={10}
          style={styles.headerButton}
          accessibilityRole="button"
          accessibilityLabel={t("search.title")}
        >
          <MaterialCommunityIcons
            name="magnify"
            size={26}
            color={colors.primary}
          />
        </Pressable>
      ),
    });
  }, [navigation, t]);

  // Loaded 100 at a time; after any write, what is already on screen reloads.
  const fetchPage = useCallback(
    async (limit: number, offset: number) =>
      listEntries(await getDb(), { limit, offset }),
    [],
  );
  const {
    items: entries,
    loading,
    hasMore,
    loadMore,
  } = usePagedList<EntryWithDetails>({
    fetchPage,
    keyOf: entryKey,
    resetKey: "all",
    refreshKey: dataVersion,
    pageSize: PAGE_SIZE,
  });

  const sections = useMemo(
    () => groupByDay(entries, entryDate, signedAmount, hasMore),
    [entries, hasMore],
  );

  const todayDate = today();
  const openEntry = useCallback(
    (id: number) => navigation.navigate("EntryForm", { entryId: id }),
    [navigation],
  );

  return (
    <View style={styles.screen}>
      {loading ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={entryKey}
          renderItem={({ item }) => (
            <EntryRow
              entry={item}
              lang={lang}
              isUpcoming={item.occurredOn > todayDate}
              onPress={openEntry}
            />
          )}
          renderSectionHeader={({ section }) => (
            <DayHeader
              date={section.date}
              todayDate={todayDate}
              lang={lang}
              spending={section.spending}
              income={section.income}
              showTotals={section.complete}
            />
          )}
          ItemSeparatorComponent={Separator}
          stickySectionHeadersEnabled
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          contentContainerStyle={
            sections.length === 0 ? styles.emptyContainer : styles.listContent
          }
          ListEmptyComponent={
            <EmptyState
              icon="format-list-bulleted"
              title={t("entries.emptyTitle")}
              body={t("entries.emptyBody")}
            />
          }
        />
      )}
      <Fab
        label={t("home.quickAdd")}
        onPress={() => navigation.navigate("EntryForm")}
      />
    </View>
  );
}

function Separator() {
  const styles = useStyles();
  return <View style={styles.separator} />;
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.background },
  headerButton: { marginRight: spacing.md },
  loader: { marginTop: spacing.xl },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: c.border,
    marginLeft: 72,
  },
  listContent: { paddingBottom: 96 },
  emptyContainer: { flexGrow: 1, justifyContent: "center" },
}));
