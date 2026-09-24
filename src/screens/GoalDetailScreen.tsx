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
import {
  getGoal,
  listMovements,
  type GoalMovementWithAccount,
  type GoalWithProgress,
} from "../db/goalsDao";
import { useAppLanguage } from "../i18n/useAppLanguage";
import { today } from "../lib/dates";
import { formatDate } from "../lib/dateLabels";
import { goalProgress } from "../lib/goals";
import { formatRupiah, formatSignedRupiah } from "../lib/money";
import { useLedgerStore } from "../store/ledgerStore";
import { colors, radius, spacing, typography } from "../theme";
import type { RootStackParamList } from "../navigation/types";
import Button from "../components/Button";

type Props = NativeStackScreenProps<RootStackParamList, "GoalDetail">;

/** One goal: progress (FR-12.6), the buttons that move money (FR-12.3, FR-12.4) and its history. */
export default function GoalDetailScreen({ route, navigation }: Props) {
  const { t } = useTranslation();
  const lang = useAppLanguage();
  const { goalId } = route.params;
  const dataVersion = useLedgerStore((s) => s.dataVersion);
  const deleteMovement = useLedgerStore((s) => s.deleteGoalMovement);
  const [goal, setGoal] = useState<GoalWithProgress | null | undefined>(
    undefined,
  );
  const [movements, setMovements] = useState<GoalMovementWithAccount[]>([]);
  const todayDate = today();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const db = await getDb();
      const [found, history] = await Promise.all([
        getGoal(db, goalId, todayDate),
        listMovements(db, goalId),
      ]);
      if (cancelled) return;
      setGoal(found);
      setMovements(history);
    })();
    return () => {
      cancelled = true;
    };
  }, [goalId, dataVersion, todayDate]);

  if (goal === undefined)
    return <ActivityIndicator style={styles.loader} color={colors.primary} />;
  if (goal === null) return null;

  const progress = goalProgress(
    goal.saved,
    goal.targetAmount,
    goal.targetDate,
    todayDate,
  );

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={[typography.title, styles.flex]} numberOfLines={1}>
            {goal.name}
          </Text>
          <Pressable
            onPress={() => navigation.navigate("GoalForm", { goalId })}
            hitSlop={8}
            accessibilityRole="button"
          >
            <Text style={styles.link}>{t("common.edit")}</Text>
          </Pressable>
        </View>

        <Text style={typography.amountLarge}>
          {formatRupiah(goal.saved, lang)}
        </Text>
        <View
          style={styles.track}
          accessible
          accessibilityRole="progressbar"
          accessibilityValue={{
            min: 0,
            max: 100,
            now: progress.percent,
            text: t("goals.savedOf", {
              saved: formatRupiah(goal.saved, lang),
              target: formatRupiah(goal.targetAmount, lang),
            }),
          }}
        >
          <View
            style={[
              styles.fill,
              {
                width: `${progress.percent}%`,
                backgroundColor:
                  progress.percent >= 100 ? colors.income : colors.primary,
              },
            ]}
          />
        </View>
        <Text style={typography.caption}>
          {t("goals.savedOf", {
            saved: formatRupiah(goal.saved, lang),
            target: formatRupiah(goal.targetAmount, lang),
          })}{" "}
          ·{" "}
          {t("goals.remaining", {
            amount: formatRupiah(progress.remaining, lang),
          })}
        </Text>
        {goal.targetDate ? (
          <Text
            style={[typography.caption, progress.overdue && styles.overdue]}
          >
            {t("goals.byDate", {
              date: formatDate(goal.targetDate, lang, { todayDate }),
            })}
            {progress.remaining > 0
              ? progress.overdue
                ? ` · ${t("goals.overdue")}`
                : ` · ${t("goals.monthlyNeeded", { amount: formatRupiah(progress.monthlyNeeded ?? 0, lang), months: progress.monthsLeft })}`
              : ` · ${t("goals.reached")}`}
          </Text>
        ) : null}
        {goal.measure === "linked" ? (
          <Text style={typography.caption}>
            {t("goals.linkedTo", { account: goal.linkedAccountName ?? "" })}
          </Text>
        ) : null}
      </View>

      {goal.measure === "manual" ? (
        <View style={styles.buttonRow}>
          <Button
            label={t("goals.contribute")}
            style={styles.flex}
            onPress={() =>
              navigation.navigate("GoalMovement", {
                goalId,
                direction: "contribution",
              })
            }
          />
          <Button
            label={t("goals.release")}
            variant="secondary"
            style={styles.flex}
            onPress={() =>
              navigation.navigate("GoalMovement", {
                goalId,
                direction: "release",
              })
            }
          />
        </View>
      ) : (
        <Text style={typography.caption}>{t("goals.linkedHint")}</Text>
      )}

      {movements.length > 0 ? (
        <>
          <Text style={[typography.label, styles.section]}>
            {t("goals.history")}
          </Text>
          <View style={styles.group}>
            {movements.map((movement, index) => {
              const signed =
                movement.direction === "contribution"
                  ? movement.amount
                  : -movement.amount;
              return (
                <View
                  key={movement.id}
                  style={[styles.row, index > 0 && styles.divider]}
                >
                  <MaterialCommunityIcons
                    name={
                      movement.direction === "contribution"
                        ? "arrow-down-circle-outline"
                        : "arrow-up-circle-outline"
                    }
                    size={22}
                    color={
                      movement.direction === "contribution"
                        ? colors.income
                        : colors.expense
                    }
                  />
                  <View style={styles.rowMiddle}>
                    <Text style={typography.body} numberOfLines={1}>
                      {movement.direction === "contribution"
                        ? t("goals.fromAccount", {
                            account: movement.accountName,
                          })
                        : t("goals.toAccount", {
                            account: movement.accountName,
                          })}
                    </Text>
                    <Text style={typography.caption} numberOfLines={1}>
                      {formatDate(movement.occurredOn, lang, { todayDate })}
                      {movement.note ? ` · ${movement.note}` : ""}
                    </Text>
                  </View>
                  <Text
                    style={[
                      typography.amount,
                      { color: signed > 0 ? colors.income : colors.expense },
                    ]}
                  >
                    {formatSignedRupiah(signed, lang)}
                  </Text>
                  <Pressable
                    onPress={() => deleteMovement(movement.id)}
                    hitSlop={8}
                    accessibilityLabel={t("common.delete")}
                  >
                    <MaterialCommunityIcons
                      name="close"
                      size={18}
                      color={colors.textMuted}
                    />
                  </Pressable>
                </View>
              );
            })}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  loader: { marginTop: spacing.xl },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  card: {
    padding: spacing.md,
    gap: spacing.xs,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  flex: { flex: 1 },
  link: { color: colors.primary, fontWeight: "600" },
  track: {
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.background,
    overflow: "hidden",
    marginTop: spacing.xs,
  },
  fill: { height: 10, borderRadius: 5 },
  overdue: { color: colors.expense },
  buttonRow: { flexDirection: "row", gap: spacing.sm },
  section: { marginTop: spacing.sm },
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
  },
  divider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  rowMiddle: { flex: 1, gap: 2 },
});
