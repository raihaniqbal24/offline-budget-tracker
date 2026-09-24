import { useEffect, useMemo, useState } from "react";
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
import { listGoals, type GoalWithProgress } from "../db/goalsDao";
import { useAppLanguage } from "../i18n/useAppLanguage";
import { today } from "../lib/dates";
import { goalProgress } from "../lib/goals";
import { formatRupiah } from "../lib/money";
import { useLedgerStore } from "../store/ledgerStore";
import { colors, radius, spacing, typography } from "../theme";
import type { RootStackParamList } from "../navigation/types";
import Button from "../components/Button";
import EmptyState from "../components/EmptyState";

type Props = NativeStackScreenProps<RootStackParamList, "Goals">;

/** Savings goals with their progress (FR-12.1, FR-12.6). */
export default function GoalsScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const lang = useAppLanguage();
  const dataVersion = useLedgerStore((s) => s.dataVersion);
  const [goals, setGoals] = useState<GoalWithProgress[] | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const todayDate = today();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await listGoals(await getDb(), todayDate);
      if (!cancelled) setGoals(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [dataVersion, todayDate]);

  const { active, archived } = useMemo(
    () => ({
      active: (goals ?? []).filter((g) => !g.archived),
      archived: (goals ?? []).filter((g) => g.archived),
    }),
    [goals],
  );

  if (goals === null)
    return <ActivityIndicator style={styles.loader} color={colors.primary} />;

  const card = (goal: GoalWithProgress) => {
    const progress = goalProgress(
      goal.saved,
      goal.targetAmount,
      goal.targetDate,
      todayDate,
    );
    return (
      <Pressable
        key={goal.id}
        onPress={() => navigation.navigate("GoalDetail", { goalId: goal.id })}
        style={({ pressed }) => [styles.card, pressed && styles.pressed]}
        accessibilityRole="button"
      >
        <View style={styles.cardHeader}>
          <Text style={[typography.body, styles.flex]} numberOfLines={1}>
            {goal.name}
          </Text>
          <Text
            style={[
              typography.label,
              progress.percent >= 100 && styles.reached,
            ]}
          >
            {progress.percent}%
          </Text>
        </View>
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
          })}
          {goal.measure === "linked" && goal.linkedAccountName
            ? ` · ${goal.linkedAccountName}`
            : ""}
        </Text>
        {progress.monthlyNeeded !== null && progress.remaining > 0 ? (
          <Text
            style={[typography.caption, progress.overdue && styles.overdue]}
          >
            {progress.overdue
              ? t("goals.overdue")
              : t("goals.monthlyNeeded", {
                  amount: formatRupiah(progress.monthlyNeeded, lang),
                  months: progress.monthsLeft,
                })}
          </Text>
        ) : null}
      </Pressable>
    );
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {active.length === 0 ? (
        <EmptyState
          icon="piggy-bank-outline"
          title={t("goals.emptyTitle")}
          body={t("goals.emptyBody")}
        />
      ) : (
        active.map(card)
      )}

      <Button
        label={t("goals.add")}
        variant="secondary"
        onPress={() => navigation.navigate("GoalForm")}
      />

      {archived.length > 0 ? (
        <>
          <Pressable
            onPress={() => setShowArchived((v) => !v)}
            style={styles.toggle}
            hitSlop={8}
          >
            <Text style={styles.link}>
              {showArchived
                ? t("goals.hideArchived")
                : t("goals.showArchived", { count: archived.length })}
            </Text>
          </Pressable>
          {showArchived ? archived.map(card) : null}
        </>
      ) : null}

      <View style={styles.note}>
        <MaterialCommunityIcons
          name="information-outline"
          size={18}
          color={colors.textMuted}
        />
        <Text style={[typography.caption, styles.flex]}>
          {t("goals.separateNote")}
        </Text>
      </View>
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
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  pressed: { backgroundColor: colors.primarySoft },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  flex: { flex: 1 },
  reached: { color: colors.income, fontWeight: "700" },
  overdue: { color: colors.expense },
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.background,
    overflow: "hidden",
  },
  fill: { height: 8, borderRadius: 4 },
  toggle: { alignSelf: "center", padding: spacing.sm },
  link: { color: colors.primary, fontWeight: "600" },
  note: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
});
