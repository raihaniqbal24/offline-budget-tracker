import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  SectionList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTranslation } from "react-i18next";
import { getDb } from "../db/client";
import { listEntries, type EntryWithDetails } from "../db/entriesDao";
import { useAppLanguage } from "../i18n/useAppLanguage";
import { today } from "../lib/dates";
import { formatDayHeader } from "../lib/dateLabels";
import { useLedgerStore } from "../store/ledgerStore";
import { colors, spacing, typography } from "../theme";
import type { RootStackParamList } from "../navigation/types";
import EmptyState from "../components/EmptyState";
import EntryRow from "../components/EntryRow";
import Fab from "../components/Fab";

const PAGE_SIZE = 100;

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface Section {
  date: string;
  data: EntryWithDetails[];
}

/** All entries, newest first, grouped by day and loaded 100 at a time. */
export default function EntriesScreen() {
  const { t } = useTranslation();
  const lang = useAppLanguage();
  const navigation = useNavigation<Nav>();
  const dataVersion = useLedgerStore((s) => s.dataVersion);

  const [entries, setEntries] = useState<EntryWithDetails[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const loadedCount = useRef(0);
  const loadingMore = useRef(false);

  // Reload whatever is already on screen after any write, so the scroll position holds.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const db = await getDb();
      const limit = Math.max(PAGE_SIZE, loadedCount.current);
      const rows = await listEntries(db, { limit });
      if (cancelled) return;
      loadedCount.current = rows.length;
      setEntries(rows);
      setHasMore(rows.length === limit);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [dataVersion]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore.current) return;
    loadingMore.current = true;
    const db = await getDb();
    const rows = await listEntries(db, {
      limit: PAGE_SIZE,
      offset: loadedCount.current,
    });
    loadedCount.current += rows.length;
    setEntries((prev) => [...prev, ...rows]);
    setHasMore(rows.length === PAGE_SIZE);
    loadingMore.current = false;
  }, [hasMore]);

  const sections = useMemo<Section[]>(() => {
    const out: Section[] = [];
    for (const entry of entries) {
      const last = out[out.length - 1];
      if (last && last.date === entry.occurredOn) last.data.push(entry);
      else out.push({ date: entry.occurredOn, data: [entry] });
    }
    return out;
  }, [entries]);

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
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <EntryRow
              entry={item}
              lang={lang}
              isUpcoming={item.occurredOn > todayDate}
              onPress={openEntry}
            />
          )}
          renderSectionHeader={({ section }) => (
            <Text style={[typography.label, styles.header]}>
              {formatDayHeader(section.date, todayDate, lang)}
            </Text>
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
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loader: {
    marginTop: spacing.xl,
  },
  header: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
    fontWeight: "600",
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: 72,
  },
  listContent: {
    paddingBottom: 96,
  },
  emptyContainer: {
    flexGrow: 1,
    justifyContent: "center",
  },
});
