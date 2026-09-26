import { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useTranslation } from "react-i18next";
import {
  importMerge,
  importReplace,
  type ImportMode,
  type ImportSummary,
} from "../backup/backupDao";
import { pickTextFile } from "../backup/files";
import {
  backupCounts,
  validateBackup,
  type BackupFile,
} from "../backup/format";
import { getDb } from "../db/client";
import { LATEST_SCHEMA_VERSION } from "../db/migrations";
import { applyLanguage } from "../i18n";
import { useAppLanguage } from "../i18n/useAppLanguage";
import { toISODate, today } from "../lib/dates";
import { formatDate } from "../lib/dateLabels";
import { useLedgerStore } from "../store/ledgerStore";
import { useSettingsStore } from "../store/settingsStore";
import { radius, spacing } from "../theme";
import { makeStyles, useTheme } from "../theme/ThemeProvider";
import type { RootStackParamList } from "../navigation/types";
import Button from "../components/Button";
import Segmented from "../components/Segmented";

type Props = NativeStackScreenProps<RootStackParamList, "Import">;

const ERROR_KEYS: Record<string, string> = {
  not_json: "import.errors.notABackup",
  not_a_backup: "import.errors.notABackup",
  newer_version: "import.errors.newerVersion",
};

/**
 * Import a JSON backup (FR-9.3 to FR-9.6): pick a file, check all of it,
 * show what it holds, then replace everything or merge. Nothing is written
 * until the user confirms, and the import runs as one transaction.
 */
export default function ImportScreen({ navigation }: Props) {
  const { typography } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const lang = useAppLanguage();
  const [file, setFile] = useState<{ name: string; backup: BackupFile } | null>(
    null,
  );
  const [mode, setMode] = useState<ImportMode>("merge");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<{
    mode: ImportMode;
    result: ImportSummary;
  } | null>(null);

  const choose = async () => {
    setError(null);
    setSummary(null);
    const picked = await pickTextFile();
    if (!picked) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(picked.text);
    } catch {
      setFile(null);
      return setError(t("import.errors.notABackup"));
    }
    const result = validateBackup(parsed, LATEST_SCHEMA_VERSION);
    if (!result.ok) {
      setFile(null);
      return setError(
        ERROR_KEYS[result.error]
          ? t(ERROR_KEYS[result.error])
          : t("import.errors.invalid", {
              detail: result.detail ?? result.error,
            }),
      );
    }
    setFile({ name: picked.name, backup: result.backup });
  };

  const run = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const db = await getDb();
      const result =
        mode === "replace"
          ? await importReplace(db, file.backup)
          : await importMerge(db, file.backup);
      // Reload everything the screens show, including settings after a restore.
      await useLedgerStore.getState().load();
      await useLedgerStore.getState().refresh();
      await useSettingsStore.getState().reload();
      if (mode === "replace")
        await applyLanguage(useSettingsStore.getState().language);
      setSummary({ mode, result });
      setFile(null);
    } catch (e) {
      setError(
        t("import.errors.failed", {
          message: String((e as Error).message ?? e),
        }),
      );
    } finally {
      setBusy(false);
    }
  };

  const confirm = () => {
    if (mode === "merge") return void run();
    Alert.alert(t("import.confirmTitle"), t("import.confirmBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("import.confirmReplace"),
        style: "destructive",
        onPress: () => void run(),
      },
    ]);
  };

  const counts = file ? backupCounts(file.backup) : null;
  const added = summary?.result.added;
  const skippedTotal = summary
    ? Object.entries(summary.result.skipped)
        .filter(([table]) => table !== "settings" && table !== "categories")
        .reduce((n, [, v]) => n + v, 0)
    : 0;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={typography.body}>{t("import.intro")}</Text>
      <Button
        label={t("import.choose")}
        variant={file ? "secondary" : "primary"}
        onPress={choose}
        disabled={busy}
      />

      {error ? (
        <View style={[styles.card, styles.errorCard]}>
          <Text style={[typography.body, styles.errorText]}>{error}</Text>
        </View>
      ) : null}

      {file && counts ? (
        <>
          <View style={styles.card}>
            <Text style={typography.title} numberOfLines={1}>
              {file.name}
            </Text>
            <Text style={typography.caption}>
              {t("import.exportedOn", {
                date: formatDate(
                  toISODate(new Date(file.backup.exportedAt)),
                  lang,
                  { todayDate: today() },
                ),
              })}
            </Text>
            <Text style={typography.body}>{t("import.contains", counts)}</Text>
          </View>

          <Segmented
            options={[
              { value: "merge", label: t("import.modeMerge") },
              { value: "replace", label: t("import.modeReplace") },
            ]}
            value={mode}
            onChange={setMode}
          />
          <Text style={typography.caption}>
            {mode === "merge" ? t("import.mergeHint") : t("import.replaceHint")}
          </Text>

          <Button
            label={
              mode === "merge" ? t("import.runMerge") : t("import.runReplace")
            }
            variant={mode === "replace" ? "danger" : "primary"}
            onPress={confirm}
            loading={busy}
          />
        </>
      ) : null}

      {summary && added ? (
        <View style={[styles.card, styles.doneCard]}>
          <Text style={typography.title}>{t("import.done")}</Text>
          <Text style={typography.body}>
            {t(
              summary.mode === "replace"
                ? "import.replacedSummary"
                : "import.addedSummary",
              {
                entries: added.entries,
                transfers: added.transfers,
                accounts: added.accounts,
                categories:
                  summary.mode === "replace"
                    ? added.categories
                    : added.categories,
              },
            )}
          </Text>
          {summary.mode === "merge" && skippedTotal > 0 ? (
            <Text style={typography.caption}>
              {t("import.skippedSummary", { count: skippedTotal })}
            </Text>
          ) : null}
          <Button
            label={t("common.done")}
            onPress={() => navigation.goBack()}
          />
        </View>
      ) : null}
    </ScrollView>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.background },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  card: {
    padding: spacing.md,
    gap: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: c.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
  },
  errorCard: { borderColor: c.expense },
  errorText: { color: c.expense },
  doneCard: { borderColor: c.primary, gap: spacing.sm },
}));
