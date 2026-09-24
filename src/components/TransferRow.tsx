import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import type { TransferWithDetails } from "../db/transfersDao";
import { formatRupiah, type AppLanguage } from "../lib/money";
import { colors, spacing, typography } from "../theme";

interface Props {
  transfer: TransferWithDetails;
  lang: AppLanguage;
  isUpcoming: boolean;
  onPress: (id: number) => void;
}

/** A transfer as from → to, amount and fee (FR-5.6). */
function TransferRow({ transfer, lang, isUpcoming, onPress }: Props) {
  const { t } = useTranslation();
  const payer =
    transfer.feePaidBy === "sender"
      ? t("transfers.payerSender")
      : t("transfers.payerRecipient");
  return (
    <Pressable
      onPress={() => onPress(transfer.id)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole="button"
      accessible
      accessibilityLabel={[
        `${transfer.fromAccountName} → ${transfer.toAccountName}`,
        formatRupiah(transfer.amount, lang),
        transfer.fee > 0
          ? t("transfers.feeCaption", {
              amount: formatRupiah(transfer.fee, lang),
              payer,
            })
          : null,
        transfer.note,
        isUpcoming ? t("entries.upcoming") : null,
      ]
        .filter(Boolean)
        .join(", ")}
    >
      <View style={styles.iconCircle}>
        <MaterialCommunityIcons
          name="bank-transfer"
          size={20}
          color={colors.transfer}
        />
      </View>
      <View style={styles.middle}>
        <Text style={typography.body} numberOfLines={1}>
          {transfer.fromAccountName} → {transfer.toAccountName}
        </Text>
        {transfer.note || isUpcoming ? (
          <Text style={typography.caption} numberOfLines={1}>
            {[isUpcoming ? t("entries.upcoming") : null, transfer.note]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        ) : null}
      </View>
      <View style={styles.right}>
        <Text
          style={[typography.amount, { color: colors.transfer }]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {formatRupiah(transfer.amount, lang)}
        </Text>
        {transfer.fee > 0 ? (
          <Text style={typography.caption}>
            {t("transfers.feeCaption", {
              amount: formatRupiah(transfer.fee, lang),
              payer,
            })}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export default memo(TransferRow);

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    backgroundColor: colors.surface,
  },
  pressed: { backgroundColor: colors.primarySoft },
  iconCircle: {
    width: 40,
    height: 40,
    flexShrink: 0,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: `${colors.transfer}22`,
  },
  middle: { flex: 1, gap: 2 },
  right: { alignItems: "flex-end", gap: 2 },
});
