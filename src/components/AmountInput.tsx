import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import {
  formatAmountInput,
  formatRupiah,
  parseAmount,
  type AppLanguage,
} from "../lib/money";
import { colors, radius, spacing, typography } from "../theme";

interface Props {
  value: string;
  onChangeText: (text: string) => void;
  lang: AppLanguage;
  autoFocus?: boolean;
  large?: boolean;
  /** Show a +/- toggle, for opening balances and alert lines that can be negative. */
  negative?: boolean;
  onToggleNegative?: () => void;
  error?: string | null;
  placeholder?: string;
}

/**
 * Amount field (FR-2.4 to FR-2.6). The phone's number pad has no letters, so
 * the shorthand suffixes are buttons under the field; the line below shows
 * what the text will be saved as, e.g. "1,5jt" -> "= Rp 1.500.000".
 */
export default function AmountInput({
  value,
  onChangeText,
  lang,
  autoFocus,
  large,
  negative,
  onToggleNegative,
  error,
  placeholder,
}: Props) {
  const { t } = useTranslation();
  const parsed = parseAmount(value);
  const hasShorthand = /[a-z]/i.test(value);

  const append = (suffix: string) => {
    if (value.trim() === "" || /[a-z]$/i.test(value)) return;
    onChangeText(formatAmountInput(value + suffix, lang));
  };

  return (
    <View style={styles.wrapper}>
      <View style={[styles.field, error ? styles.fieldError : null]}>
        {onToggleNegative ? (
          <Pressable
            onPress={onToggleNegative}
            style={styles.sign}
            accessibilityRole="button"
            accessibilityLabel={t("amount.toggleSign")}
          >
            <Text style={[styles.signText, negative && styles.signNegative]}>
              {negative ? "−" : "+"}
            </Text>
          </Pressable>
        ) : null}
        <Text style={[large ? styles.currencyLarge : styles.currency]}>Rp</Text>
        <TextInput
          value={value}
          onChangeText={(text) => onChangeText(formatAmountInput(text, lang))}
          keyboardType="numeric"
          autoFocus={autoFocus}
          placeholder={placeholder ?? "0"}
          placeholderTextColor={colors.textMuted}
          style={[
            styles.input,
            large ? typography.amountLarge : typography.amount,
          ]}
          accessibilityLabel={t("entryForm.amount")}
        />
      </View>

      <View style={styles.suffixRow}>
        {["000", "rb", "jt"].map((suffix) => (
          <Pressable
            key={suffix}
            onPress={() => append(suffix)}
            style={({ pressed }) => [
              styles.suffix,
              pressed && styles.suffixPressed,
            ]}
            accessibilityRole="button"
          >
            <Text style={styles.suffixText}>{suffix}</Text>
          </Pressable>
        ))}
        <View style={styles.previewBox}>
          {hasShorthand && parsed !== null ? (
            <Text style={[typography.label, styles.preview]} numberOfLines={1}>
              = {formatRupiah(negative ? -parsed : parsed, lang)}
            </Text>
          ) : null}
        </View>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: spacing.sm,
  },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: 56,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  fieldError: {
    borderColor: colors.expense,
  },
  sign: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  signText: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.income,
  },
  signNegative: {
    color: colors.expense,
  },
  currency: {
    fontSize: 16,
    color: colors.textMuted,
    fontWeight: "600",
  },
  currencyLarge: {
    fontSize: 22,
    color: colors.textMuted,
    fontWeight: "600",
  },
  input: {
    flex: 1,
    paddingVertical: spacing.sm,
  },
  suffixRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  suffix: {
    minWidth: 52,
    height: 36,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primarySoft,
  },
  suffixPressed: {
    opacity: 0.7,
  },
  suffixText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.primary,
  },
  previewBox: {
    flex: 1,
    alignItems: "flex-end",
  },
  preview: {
    color: colors.primary,
  },
  error: {
    fontSize: 13,
    color: colors.expense,
  },
});
