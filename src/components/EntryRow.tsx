import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { EntryWithDetails } from "../db/entriesDao";
import { categoryLabel } from "../i18n";
import { formatSignedRupiah, type AppLanguage } from "../lib/money";
import { colors, spacing, typography } from "../theme";
import CategoryIcon from "./CategoryIcon";

interface Props {
  entry: EntryWithDetails;
  lang: AppLanguage;
  isUpcoming: boolean;
  onPress: (id: number) => void;
}

/** Spending shows as negative, income and positive adjustments as positive. */
export function signedAmount(
  entry: Pick<EntryWithDetails, "type" | "amount">,
): number {
  return entry.type === "expense" ? -entry.amount : entry.amount;
}

function EntryRow({ entry, lang, isUpcoming, onPress }: Props) {
  const { t } = useTranslation();
  const amount = signedAmount(entry);
  const label = categoryLabel({
    name: entry.categoryName,
    i18nKey: entry.categoryI18nKey,
  });

  return (
    <Pressable
      onPress={() => onPress(entry.id)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole="button"
    >
      <CategoryIcon icon={entry.categoryIcon} color={entry.categoryColor} />
      <View style={styles.middle}>
        <Text style={typography.body} numberOfLines={1}>
          {label}
        </Text>
        {entry.note ? (
          <Text style={typography.caption} numberOfLines={1}>
            {entry.note}
          </Text>
        ) : null}
      </View>
      <View style={styles.right}>
        <Text
          style={[
            typography.amount,
            { color: amount < 0 ? colors.expense : colors.income },
          ]}
        >
          {formatSignedRupiah(amount, lang)}
        </Text>
        <Text style={typography.caption} numberOfLines={1}>
          {isUpcoming
            ? `${t("entries.upcoming")} · ${entry.accountName}`
            : entry.accountName}
        </Text>
      </View>
    </Pressable>
  );
}

export default memo(EntryRow);

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    backgroundColor: colors.surface,
  },
  pressed: {
    backgroundColor: colors.primarySoft,
  },
  middle: {
    flex: 1,
    gap: 2,
  },
  right: {
    alignItems: "flex-end",
    gap: 2,
    maxWidth: "45%",
  },
});
