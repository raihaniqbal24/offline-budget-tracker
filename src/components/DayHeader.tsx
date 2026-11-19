import { Text, View } from "react-native";
import type { ISODate } from "../lib/dates";
import { formatDayHeader } from "../lib/dateLabels";
import { formatSignedRupiah, type AppLanguage } from "../lib/money";
import { spacing } from "../theme";
import { makeStyles, useTheme } from "../theme/ThemeProvider";

interface Props {
  date: ISODate;
  todayDate: ISODate;
  lang: AppLanguage;
  spending: number;
  income: number;
  /** Hide the totals while the day may continue on the next page. */
  showTotals: boolean;
}

/** Day label for grouped lists, with that day's spending and income on the right. */
export default function DayHeader({
  date,
  todayDate,
  lang,
  spending,
  income,
  showTotals,
}: Props) {
  const { colors, typography } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.row}>
      <Text style={[typography.label, styles.title]} numberOfLines={1}>
        {formatDayHeader(date, todayDate, lang)}
      </Text>
      {showTotals ? (
        <View style={styles.totals}>
          {spending > 0 ? (
            <Text style={[typography.caption, { color: colors.expense }]}>
              {formatSignedRupiah(-spending, lang)}
            </Text>
          ) : null}
          {income > 0 ? (
            <Text style={[typography.caption, { color: colors.income }]}>
              {formatSignedRupiah(income, lang)}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  row: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.sm,
    backgroundColor: c.background,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  title: { flex: 1, fontWeight: "600" },
  totals: { flexDirection: "row", gap: spacing.sm },
}));
