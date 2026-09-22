import { StyleSheet, Text, View } from "react-native";
import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { useTranslation } from "react-i18next";
import { addDays, parseISODate, toISODate, type ISODate } from "../lib/dates";
import { formatDate } from "../lib/dateLabels";
import type { AppLanguage } from "../lib/money";
import { spacing, typography } from "../theme";
import Chip from "./Chip";

interface Props {
  value: ISODate;
  onChange: (value: ISODate) => void;
  lang: AppLanguage;
  todayDate: ISODate;
}

/** Today, one-tap Yesterday, and a date picker (FR-2.2), with a note for future dates. */
export default function DateField({ value, onChange, lang, todayDate }: Props) {
  const { t } = useTranslation();
  const yesterdayDate = addDays(todayDate, -1);
  const isOther = value !== todayDate && value !== yesterdayDate;

  const pick = () => {
    DateTimePickerAndroid.open({
      value: parseISODate(value),
      mode: "date",
      onChange: (event, date) => {
        if (event.type === "set" && date) onChange(toISODate(date));
      },
    });
  };

  return (
    <View style={styles.wrapper}>
      <View style={styles.row}>
        <Chip label={t("common.today")} selected={value === todayDate} onPress={() => onChange(todayDate)} />
        <Chip label={t("common.yesterday")} selected={value === yesterdayDate} onPress={() => onChange(yesterdayDate)} />
        <Chip
          label={isOther ? formatDate(value, lang, { todayDate, weekday: true }) : t("entryForm.pickDate")}
          icon="calendar"
          selected={isOther}
          onPress={pick}
        />
      </View>
      {value > todayDate ? (
        <Text style={typography.caption}>
          {t("entryForm.futureHint", { date: formatDate(value, lang, { todayDate }) })}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
});
