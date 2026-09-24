import { useEffect, useState } from "react";
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
import { listPendingEntries, type PendingWithRule } from "../db/recurringDao";
import { categoryLabel } from "../i18n";
import { useAppLanguage } from "../i18n/useAppLanguage";
import { today } from "../lib/dates";
import { formatDate } from "../lib/dateLabels";
import { formatRupiah } from "../lib/money";
import { useLedgerStore } from "../store/ledgerStore";
import { colors, radius, spacing, typography } from "../theme";
import type { RootStackParamList } from "../navigation/types";
import EmptyState from "../components/EmptyState";

type Props = NativeStackScreenProps<RootStackParamList, "Pending">;

/** FR-11.3: occurrences waiting to be confirmed, oldest first. */
export default function PendingScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const lang = useAppLanguage();
  const dataVersion = useLedgerStore((s) => s.dataVersion);
  const [rows, setRows] = useState<PendingWithRule[] | null>(null);
  const todayDate = today();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await listPendingEntries(await getDb());
      if (!cancelled) setRows(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [dataVersion]);

  if (rows === null)
    return <ActivityIndicator style={styles.loader} color={colors.primary} />;
  if (rows.length === 0) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <EmptyState
          icon="check-circle-outline"
          title={t("pending.emptyTitle")}
          body={t("pending.emptyBody")}
        />
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={typography.caption}>{t("pending.intro")}</Text>
      <View style={styles.group}>
        {rows.map((row) => (
          <Pressable
            key={row.id}
            onPress={() =>
              navigation.navigate("PendingConfirm", { pendingId: row.id })
            }
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            <MaterialCommunityIcons
              name={
                row.rule.type === "transfer"
                  ? "bank-transfer"
                  : row.rule.type === "income"
                    ? "cash-plus"
                    : "cash-minus"
              }
              size={24}
              color={
                row.rule.type === "income" ? colors.income : colors.primary
              }
            />
            <View style={styles.rowMiddle}>
              <Text style={typography.body} numberOfLines={1}>
                {row.rule.note?.trim() ||
                  (row.rule.type === "transfer"
                    ? `${row.accountName} → ${row.toAccountName ?? ""}`
                    : row.categoryName
                      ? categoryLabel({
                          name: row.categoryName,
                          i18nKey: row.categoryI18nKey,
                        })
                      : "")}
              </Text>
              <Text
                style={[
                  typography.caption,
                  row.dueDate <= todayDate && styles.due,
                ]}
              >
                {t("pending.due", {
                  date: formatDate(row.dueDate, lang, {
                    todayDate,
                    weekday: true,
                  }),
                })}
              </Text>
            </View>
            <Text style={typography.amount}>
              {formatRupiah(row.rule.amount, lang)}
            </Text>
            <MaterialCommunityIcons
              name="chevron-right"
              size={20}
              color={colors.textMuted}
            />
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  centered: { justifyContent: "center" },
  loader: { marginTop: spacing.xl },
  content: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
  group: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  pressed: { backgroundColor: colors.primarySoft },
  rowMiddle: { flex: 1, gap: 2 },
  due: { color: colors.primary, fontWeight: "600" },
});
