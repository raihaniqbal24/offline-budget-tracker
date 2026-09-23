import { useState, type ReactNode } from "react";
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import {
  exportFile,
  type ExportKind,
  type ExportTarget,
} from "../backup/actions";
import { useAppLanguage } from "../i18n/useAppLanguage";
import { toISODate, today } from "../lib/dates";
import { formatDate, weekdayShortName } from "../lib/dateLabels";
import { formatTime, parseTime } from "../notifications/content";
import { useSettingsStore } from "../store/settingsStore";
import { colors, radius, spacing, typography } from "../theme";
import type { LanguageSetting } from "../types";
import type { RootStackParamList } from "../navigation/types";
import Button from "../components/Button";
import Chip from "../components/Chip";

const LANGUAGE_OPTIONS: { value: LanguageSetting; labelKey: string }[] = [
  { value: "system", labelKey: "settings.languageSystem" },
  { value: "en", labelKey: "settings.languageEn" },
  { value: "id", labelKey: "settings.languageId" },
];

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function SettingsScreen() {
  const { t } = useTranslation();
  const lang = useAppLanguage();
  const navigation = useNavigation<Nav>();
  const s = useSettingsStore();
  const [status, setStatus] = useState<{
    kind: ExportKind;
    text: string;
    error?: boolean;
  } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const pickTime = (value: string, onPick: (v: string) => void) => {
    const { hour, minute } = parseTime(value);
    const date = new Date();
    date.setHours(hour, minute, 0, 0);
    DateTimePickerAndroid.open({
      value: date,
      mode: "time",
      is24Hour: true,
      onChange: (event, picked) => {
        if (event.type === "set" && picked)
          onPick(formatTime(picked.getHours(), picked.getMinutes()));
      },
    });
  };

  const runExport = async (kind: ExportKind, target: ExportTarget) => {
    setBusy(`${kind}:${target}`);
    setStatus(null);
    try {
      const done = await exportFile(kind, target);
      if (done && target === "folder")
        setStatus({ kind, text: t("settings.saved") });
    } catch (e) {
      setStatus({
        kind,
        text: t("settings.exportFailed", {
          message: String((e as Error).message ?? e),
        }),
        error: true,
      });
    } finally {
      setBusy(null);
    }
  };

  const lastBackup = s.lastBackupAt
    ? t("settings.lastBackup", {
        date: formatDate(toISODate(new Date(s.lastBackupAt)), lang, {
          todayDate: today(),
        }),
      })
    : t("settings.neverBackedUp");

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {/* Language */}
      <Text style={[typography.label, styles.sectionTitle]}>
        {t("settings.language")}
      </Text>
      <View style={styles.group} accessibilityRole="radiogroup">
        {LANGUAGE_OPTIONS.map((option, index) => {
          const selected = option.value === s.language;
          return (
            <Pressable
              key={option.value}
              style={({ pressed }) => [
                styles.row,
                index > 0 && styles.rowDivider,
                pressed && styles.rowPressed,
              ]}
              onPress={() => s.setLanguage(option.value)}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
            >
              <Text style={[typography.body, styles.rowLabel]}>
                {t(option.labelKey)}
              </Text>
              {selected && (
                <MaterialCommunityIcons
                  name="check"
                  size={22}
                  color={colors.primary}
                />
              )}
            </Pressable>
          );
        })}
      </View>

      {/* Notifications (FR-9.7, FR-10) */}
      <Text style={[typography.label, styles.sectionTitle]}>
        {t("settings.notifications")}
      </Text>
      {s.permissionDenied ? (
        <View style={styles.warning}>
          <Text style={typography.body}>{t("settings.permissionDenied")}</Text>
          <Button
            label={t("settings.openSystemSettings")}
            variant="secondary"
            onPress={() => Linking.openSettings()}
          />
        </View>
      ) : null}
      <View style={styles.group}>
        <ToggleRow
          label={t("settings.dailyReminder")}
          hint={t("settings.dailyReminderHint")}
          value={s.dailyReminderEnabled}
          onChange={(v) =>
            s.setNotificationEnabled("daily_reminder_enabled", v)
          }
        >
          {s.dailyReminderEnabled ? (
            <TimeRow
              label={t("settings.time")}
              value={s.dailyReminderTime}
              onPress={() =>
                pickTime(s.dailyReminderTime, (v) =>
                  s.setReminderSchedule({ dailyReminderTime: v }),
                )
              }
            />
          ) : null}
        </ToggleRow>

        <ToggleRow
          divider
          label={t("settings.backupReminder")}
          hint={t("settings.backupReminderHint")}
          value={s.backupReminderEnabled}
          onChange={(v) =>
            s.setNotificationEnabled("backup_reminder_enabled", v)
          }
        >
          {s.backupReminderEnabled ? (
            <>
              <View style={styles.weekdays}>
                {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                  <Chip
                    key={d}
                    label={weekdayShortName(d, lang)}
                    selected={s.backupReminderWeekday === d}
                    onPress={() =>
                      s.setReminderSchedule({ backupReminderWeekday: d })
                    }
                  />
                ))}
              </View>
              <TimeRow
                label={t("settings.time")}
                value={s.backupReminderTime}
                onPress={() =>
                  pickTime(s.backupReminderTime, (v) =>
                    s.setReminderSchedule({ backupReminderTime: v }),
                  )
                }
              />
            </>
          ) : null}
        </ToggleRow>

        <ToggleRow
          divider
          label={t("settings.alerts")}
          hint={t("settings.alertsHint")}
          value={s.alertsEnabled}
          onChange={(v) => s.setNotificationEnabled("alerts_enabled", v)}
        />
      </View>

      {/* Backup (FR-9) */}
      <Text style={[typography.label, styles.sectionTitle]}>
        {t("settings.backup")}
      </Text>
      <View style={[styles.group, styles.padded]}>
        <Text style={typography.caption}>{lastBackup}</Text>

        <ExportBlock
          title={t("settings.exportBackup")}
          hint={t("settings.exportBackupHint")}
          busy={busy}
          kind="backup"
          onExport={runExport}
          status={status?.kind === "backup" ? status : null}
        />
        <ExportBlock
          title={t("settings.exportCsv")}
          hint={t("settings.exportCsvHint")}
          busy={busy}
          kind="entries"
          onExport={runExport}
          status={status?.kind === "entries" ? status : null}
        />

        <View style={styles.block}>
          <Text style={typography.body}>{t("settings.importBackup")}</Text>
          <Text style={typography.caption}>
            {t("settings.importBackupHint")}
          </Text>
          <Button
            label={t("settings.importBackup")}
            variant="secondary"
            onPress={() => navigation.navigate("Import")}
          />
        </View>
      </View>

      {/* Data */}
      <Text style={[typography.label, styles.sectionTitle]}>
        {t("settings.data")}
      </Text>
      <View style={styles.group}>
        <View style={styles.row}>
          <Text style={[typography.body, styles.rowLabel]}>
            {t("settings.schemaVersion")}
          </Text>
          <Text style={typography.amount}>{s.schemaVersion}</Text>
        </View>
      </View>
    </ScrollView>
  );
}

function ToggleRow({
  label,
  hint,
  value,
  onChange,
  divider,
  children,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (value: boolean) => void;
  divider?: boolean;
  children?: ReactNode;
}) {
  return (
    <View style={[styles.toggleBox, divider && styles.rowDivider]}>
      <View style={styles.toggleRow}>
        <View style={styles.flex}>
          <Text style={typography.body}>{label}</Text>
          <Text style={typography.caption}>{hint}</Text>
        </View>
        <Switch
          value={value}
          onValueChange={onChange}
          trackColor={{ true: colors.primary, false: colors.border }}
          thumbColor={colors.surface}
          accessibilityLabel={label}
        />
      </View>
      {children}
    </View>
  );
}

function TimeRow({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={styles.timeRow}
      accessibilityRole="button"
    >
      <MaterialCommunityIcons
        name="clock-outline"
        size={20}
        color={colors.primary}
      />
      <Text style={[typography.body, styles.flex]}>{label}</Text>
      <Text style={[typography.amount, { color: colors.primary }]}>
        {value}
      </Text>
    </Pressable>
  );
}

function ExportBlock({
  title,
  hint,
  kind,
  busy,
  status,
  onExport,
}: {
  title: string;
  hint: string;
  kind: ExportKind;
  busy: string | null;
  status: { text: string; error?: boolean } | null;
  onExport: (kind: ExportKind, target: ExportTarget) => void;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.block}>
      <Text style={typography.body}>{title}</Text>
      <Text style={typography.caption}>{hint}</Text>
      <View style={styles.buttonRow}>
        <Button
          label={t("settings.share")}
          variant="secondary"
          style={styles.flex}
          loading={busy === `${kind}:share`}
          disabled={busy !== null}
          onPress={() => onExport(kind, "share")}
        />
        <Button
          label={t("settings.saveToFolder")}
          variant="secondary"
          style={styles.flex}
          loading={busy === `${kind}:folder`}
          disabled={busy !== null}
          onPress={() => onExport(kind, "folder")}
        />
      </View>
      {status ? (
        <Text style={[typography.caption, status.error && styles.errorText]}>
          {status.text}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
  sectionTitle: { marginTop: spacing.md, marginLeft: spacing.xs },
  group: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: "hidden",
  },
  padded: { padding: spacing.md, gap: spacing.md },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    minHeight: 52,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  rowPressed: { backgroundColor: colors.primarySoft },
  rowLabel: { flex: 1 },
  toggleBox: { padding: spacing.md, gap: spacing.sm },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 40,
  },
  weekdays: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  flex: { flex: 1 },
  warning: {
    padding: spacing.md,
    gap: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: "#FDF3E1",
    borderWidth: 1,
    borderColor: colors.budget75,
  },
  block: { gap: spacing.xs },
  buttonRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
  errorText: { color: colors.expense },
});
