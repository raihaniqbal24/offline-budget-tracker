import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useTranslation } from "react-i18next";
import { getDb } from "../db/client";
import { listEntries, type EntryWithDetails } from "../db/entriesDao";
import { useAppLanguage } from "../i18n/useAppLanguage";
import { today } from "../lib/dates";
import { useLedgerStore } from "../store/ledgerStore";
import { spacing } from "../theme";
import { makeStyles, useTheme } from "../theme/ThemeProvider";
import type { RootStackParamList } from "../navigation/types";
import EmptyState from "../components/EmptyState";
import EntryRow from "../components/EntryRow";

type Props = NativeStackScreenProps<RootStackParamList, "Adjustments">;

/** Unrecorded adjustments in a period, opened from the summary breakdown (FR-3.6). */
export default function AdjustmentsScreen({ route, navigation }: Props) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const lang = useAppLanguage();
  const { start, end, accountId = null } = route.params;
  const dataVersion = useLedgerStore((s) => s.dataVersion);
  const [rows, setRows] = useState<EntryWithDetails[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const db = await getDb();
      const result = await listEntries(db, {
        limit: 500,
        range: { start, end },
        accountId,
        type: "adjustment",
      });
      if (!cancelled) setRows(result);
    })();
    return () => {
      cancelled = true;
    };
  }, [start, end, accountId, dataVersion]);

  if (rows === null)
    return <ActivityIndicator style={styles.loader} color={colors.primary} />;

  const todayDate = today();
  return (
    <FlatList
      style={styles.screen}
      data={rows}
      keyExtractor={(e) => String(e.id)}
      renderItem={({ item }) => (
        <EntryRow
          entry={item}
          lang={lang}
          isUpcoming={item.occurredOn > todayDate}
          onPress={(id) => navigation.navigate("Adjustment", { entryId: id })}
        />
      )}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      contentContainerStyle={rows.length === 0 ? styles.empty : undefined}
      ListEmptyComponent={
        <EmptyState
          icon="check-circle-outline"
          title={t("adjustment.noneLeft")}
        />
      }
    />
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.background },
  loader: { marginTop: spacing.xl },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: c.border,
    marginLeft: 72,
  },
  empty: { flexGrow: 1, justifyContent: "center" },
}));
