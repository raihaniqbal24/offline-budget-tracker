import { useMemo, useState, type ComponentProps } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAppLanguage } from "../i18n/useAppLanguage";
import { formatRupiah, type AppLanguage } from "../lib/money";
import { useLedgerStore } from "../store/ledgerStore";
import { radius, spacing } from "../theme";
import { makeStyles, useTheme } from "../theme/ThemeProvider";
import type { AccountWithBalance } from "../types";
import type { RootStackParamList } from "../navigation/types";
import { ACCOUNT_TYPE_ICONS } from "../components/accountTypes";
import Button from "../components/Button";
import EmptyState from "../components/EmptyState";

type Nav = NativeStackNavigationProp<RootStackParamList>;
type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

export default function AccountsScreen() {
  const { typography } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const lang = useAppLanguage();
  const navigation = useNavigation<Nav>();
  const accounts = useLedgerStore((s) => s.accounts);
  const [showArchived, setShowArchived] = useState(false);

  const active = useMemo(() => accounts.filter((a) => !a.archived), [accounts]);
  const archived = useMemo(
    () => accounts.filter((a) => a.archived),
    [accounts],
  );
  const total = active.reduce((sum, a) => sum + a.balance, 0);
  const data = showArchived ? [...active, ...archived] : active;

  const open = (id?: number) =>
    navigation.navigate("AccountForm", id ? { accountId: id } : undefined);

  if (accounts.length === 0) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <EmptyState
          icon="wallet-plus-outline"
          title={t("home.noAccountsTitle")}
          body={t("home.noAccountsBody")}
          actionLabel={t("accounts.add")}
          onAction={() => open()}
        />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={data}
      keyExtractor={(a) => String(a.id)}
      ListHeaderComponent={
        <View style={styles.totalRow}>
          <Text style={typography.label}>{t("accounts.total")}</Text>
          <Text
            style={[
              typography.title,
              styles.amount,
              total < 0 && styles.negative,
            ]}
          >
            {formatRupiah(total, lang)}
          </Text>
        </View>
      }
      renderItem={({ item, index }) => (
        <AccountRow
          account={item}
          lang={lang}
          first={index === 0}
          onPress={() => open(item.id)}
        />
      )}
      ListFooterComponent={
        <View style={styles.footer}>
          <Button label={t("accounts.add")} onPress={() => open()} />
          {archived.length > 0 ? (
            <Pressable
              onPress={() => setShowArchived((v) => !v)}
              hitSlop={8}
              style={styles.toggle}
            >
              <Text style={styles.link}>
                {showArchived
                  ? t("accounts.hideArchived")
                  : t("accounts.showArchived", { count: archived.length })}
              </Text>
            </Pressable>
          ) : null}
        </View>
      }
    />
  );
}

function AccountRow({
  account,
  lang,
  first,
  onPress,
}: {
  account: AccountWithBalance;
  lang: AppLanguage;
  first: boolean;
  onPress: () => void;
}) {
  const { colors, typography } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        !first && styles.rowDivider,
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
    >
      <MaterialCommunityIcons
        name={ACCOUNT_TYPE_ICONS[account.type] as IconName}
        size={24}
        color={account.archived ? colors.textMuted : colors.primary}
      />
      <View style={styles.rowMiddle}>
        <Text
          style={[typography.body, account.archived && styles.muted]}
          numberOfLines={1}
        >
          {account.name}
        </Text>
        <Text style={typography.caption}>
          {account.archived
            ? t("accounts.archivedBadge")
            : t(`accounts.types.${account.type}`)}
        </Text>
      </View>
      <View style={styles.rowRight}>
        <Text
          style={[typography.amount, account.balance < 0 && styles.negative]}
        >
          {formatRupiah(account.balance, lang)}
        </Text>
        {account.isBelowAlertLine && !account.archived ? (
          <View style={styles.flag}>
            <MaterialCommunityIcons
              name="alert-circle"
              size={14}
              color={colors.alert}
            />
            <Text style={styles.flagText}>{t("accounts.belowLine")}</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.background },
  centered: { justifyContent: "center" },
  content: { padding: spacing.md },
  totalRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  amount: { fontVariant: ["tabular-nums"] },
  negative: { color: c.expense },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: c.surface,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.border,
  },
  pressed: { backgroundColor: c.primarySoft },
  rowMiddle: { flex: 1, gap: 2 },
  rowRight: { alignItems: "flex-end", gap: 2 },
  muted: { color: c.textMuted },
  flag: { flexDirection: "row", alignItems: "center", gap: 4 },
  flagText: { fontSize: 12, color: c.alert },
  footer: { marginTop: spacing.lg, gap: spacing.md },
  toggle: { alignSelf: "center", padding: spacing.sm },
  link: { color: c.primary, fontWeight: "600" },
}));
