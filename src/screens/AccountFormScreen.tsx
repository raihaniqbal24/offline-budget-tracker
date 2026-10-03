import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useTranslation } from "react-i18next";
import { useAppLanguage } from "../i18n/useAppLanguage";
import { formatNumber, formatRupiah, parseAmount } from "../lib/money";
import { useLedgerStore } from "../store/ledgerStore";
import { radius, spacing } from "../theme";
import { makeStyles, useTheme } from "../theme/ThemeProvider";
import type { AccountType } from "../types";
import type { RootStackParamList } from "../navigation/types";
import { ACCOUNT_TYPE_ICONS, ACCOUNT_TYPES } from "../components/accountTypes";
import AmountInput from "../components/AmountInput";
import Button from "../components/Button";
import KeyboardAvoider from "../components/KeyboardAvoider";
import Chip from "../components/Chip";

type Props = NativeStackScreenProps<RootStackParamList, "AccountForm">;

/** Create or edit an account (FR-1.1), and archive or restore it (FR-1.8). */
export default function AccountFormScreen({ route, navigation }: Props) {
  const { colors, typography } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const lang = useAppLanguage();
  const accountId = route.params?.accountId;
  const accounts = useLedgerStore((s) => s.accounts);
  const saveAccount = useLedgerStore((s) => s.saveAccount);
  const setArchived = useLedgerStore((s) => s.setAccountArchived);
  const existing = useMemo(
    () => accounts.find((a) => a.id === accountId),
    [accounts, accountId],
  );

  const [name, setName] = useState(existing?.name ?? "");
  const [type, setType] = useState<AccountType>(existing?.type ?? "cash");
  const [openingText, setOpeningText] = useState(
    existing ? formatNumber(Math.abs(existing.openingBalance), lang) : "",
  );
  const [openingNegative, setOpeningNegative] = useState(
    (existing?.openingBalance ?? 0) < 0,
  );
  const [alertText, setAlertText] = useState(
    existing?.alertLine != null
      ? formatNumber(Math.abs(existing.alertLine), lang)
      : "",
  );
  const [alertNegative, setAlertNegative] = useState(
    (existing?.alertLine ?? 0) < 0,
  );
  const [errors, setErrors] = useState<{
    name?: string;
    opening?: string;
    alert?: string;
    save?: string;
  }>({});
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const next: typeof errors = {};
    if (name.trim().length === 0) next.name = t("accountForm.nameRequired");

    const opening = openingText.trim() === "" ? 0 : parseAmount(openingText);
    if (opening === null) next.opening = t("amount.invalid");

    const alert = alertText.trim() === "" ? null : parseAmount(alertText);
    if (alertText.trim() !== "" && alert === null)
      next.alert = t("amount.invalid");

    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    try {
      await saveAccount(
        {
          name,
          type,
          openingBalance: openingNegative ? -(opening ?? 0) : (opening ?? 0),
          alertLine: alert === null ? null : alertNegative ? -alert : alert,
        },
        accountId,
      );
      navigation.goBack();
    } catch (error) {
      setErrors({
        save: t("errors.saveFailed", {
          message: String((error as Error).message ?? error),
        }),
      });
      setSaving(false);
    }
  };

  const toggleArchived = async () => {
    if (!existing) return;
    await setArchived(existing.id, !existing.archived);
    navigation.goBack();
  };

  return (
    <KeyboardAvoider style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={typography.label}>{t("accountForm.name")}</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={t("accountForm.namePlaceholder")}
          placeholderTextColor={colors.textMuted}
          style={[styles.textInput, errors.name ? styles.inputError : null]}
          autoFocus={!existing}
          maxLength={40}
        />
        {errors.name ? <Text style={styles.error}>{errors.name}</Text> : null}

        <Text style={[typography.label, styles.label]}>
          {t("accountForm.type")}
        </Text>
        <View style={styles.wrap}>
          {ACCOUNT_TYPES.map((value) => (
            <Chip
              key={value}
              label={t(`accounts.types.${value}`)}
              icon={ACCOUNT_TYPE_ICONS[value]}
              selected={type === value}
              onPress={() => setType(value)}
            />
          ))}
        </View>

        <Text style={[typography.label, styles.label]}>
          {t("accountForm.openingBalance")}
        </Text>
        <AmountInput
          value={openingText}
          onChangeText={setOpeningText}
          lang={lang}
          negative={openingNegative}
          onToggleNegative={() => setOpeningNegative((v) => !v)}
          error={errors.opening}
        />
        <Text style={typography.caption}>
          {t("accountForm.openingBalanceHint")}
        </Text>

        <Text style={[typography.label, styles.label]}>
          {t("accountForm.alertLine")}
        </Text>
        <AmountInput
          value={alertText}
          onChangeText={setAlertText}
          lang={lang}
          negative={alertNegative}
          onToggleNegative={() => setAlertNegative((v) => !v)}
          error={errors.alert}
          placeholder={t("accountForm.alertLinePlaceholder")}
        />
        <Text style={typography.caption}>{t("accountForm.alertLineHint")}</Text>
        {existing ? (
          <Text
            style={[
              typography.caption,
              existing.isBelowAlertLine && styles.flagged,
            ]}
          >
            {existing.alertLine === null
              ? t("accountForm.alertLineNone", {
                  balance: formatRupiah(existing.balance, lang),
                })
              : existing.isBelowAlertLine
                ? t("accountForm.alertLineBelow", {
                    balance: formatRupiah(existing.balance, lang),
                  })
                : t("accountForm.alertLineAbove", {
                    balance: formatRupiah(existing.balance, lang),
                  })}
          </Text>
        ) : null}

        {existing && !existing.archived ? (
          <View style={styles.archiveBox}>
            <Button
              label={t("reconcile.title")}
              variant="secondary"
              onPress={() =>
                navigation.navigate("Reconcile", { accountId: existing.id })
              }
            />
            <Text style={typography.caption}>{t("reconcile.hint")}</Text>
          </View>
        ) : null}

        {existing ? (
          <View style={styles.archiveBox}>
            <Button
              label={
                existing.archived
                  ? t("accountForm.restore")
                  : t("accountForm.archive")
              }
              variant="secondary"
              onPress={toggleArchived}
            />
            <Text style={typography.caption}>
              {t("accountForm.archiveHint")}
            </Text>
          </View>
        ) : null}

        {errors.save ? <Text style={styles.error}>{errors.save}</Text> : null}
      </ScrollView>

      <View style={styles.footer}>
        <Button label={t("common.save")} onPress={save} loading={saving} />
      </View>
    </KeyboardAvoider>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.background },
  content: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
  label: { marginTop: spacing.md },
  textInput: {
    minHeight: 52,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
    fontSize: 16,
    color: c.text,
  },
  inputError: { borderColor: c.expense },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  archiveBox: { marginTop: spacing.xl, gap: spacing.sm },
  error: { fontSize: 13, color: c.expense },
  flagged: { color: c.alert },
  footer: {
    padding: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.border,
    backgroundColor: c.surface,
  },
}));
