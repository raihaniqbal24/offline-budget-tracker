import { useMemo, useState, type ComponentProps } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { categoryLabel } from "../i18n";
import { useLedgerStore } from "../store/ledgerStore";
import { radius, spacing } from "../theme";
import { makeStyles, useTheme } from "../theme/ThemeProvider";
import type { Category, CategoryType } from "../types";
import type { RootStackParamList } from "../navigation/types";
import Button from "../components/Button";
import CategoryIcon from "../components/CategoryIcon";
import Segmented from "../components/Segmented";

type Props = NativeStackScreenProps<RootStackParamList, "Categories">;
type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

/** Category management (FR-6): add, edit, reorder and archive, per type. */
export default function CategoriesScreen({ navigation }: Props) {
  const { colors, typography } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const categories = useLedgerStore((s) => s.categories);
  const moveCategory = useLedgerStore((s) => s.moveCategory);
  const [type, setType] = useState<CategoryType>("expense");
  const [showArchived, setShowArchived] = useState(false);

  const { active, archived, builtins } = useMemo(() => {
    const ofType = categories.filter((c) => c.type === type);
    return {
      active: ofType.filter((c) => c.builtinKey === null && !c.archived),
      archived: ofType.filter((c) => c.builtinKey === null && c.archived),
      builtins: ofType.filter((c) => c.builtinKey !== null),
    };
  }, [categories, type]);

  const open = (c: Category) =>
    navigation.navigate("CategoryForm", { categoryId: c.id });

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Segmented
        options={[
          { value: "expense", label: t("categories.expense") },
          { value: "income", label: t("categories.income") },
        ]}
        value={type}
        onChange={(v) => {
          setType(v);
          setShowArchived(false);
        }}
      />

      <View style={styles.group}>
        {active.map((c, i) => (
          <View key={c.id} style={[styles.row, i > 0 && styles.divider]}>
            <Pressable
              onPress={() => open(c)}
              style={styles.rowMain}
              accessibilityRole="button"
            >
              <CategoryIcon icon={c.icon} color={c.color} size={36} />
              <Text style={[typography.body, styles.name]} numberOfLines={1}>
                {categoryLabel(c)}
              </Text>
            </Pressable>
            <MoveButton
              icon="chevron-up"
              disabled={i === 0}
              label={t("categories.moveUp")}
              onPress={() => moveCategory(c.id, -1)}
            />
            <MoveButton
              icon="chevron-down"
              disabled={i === active.length - 1}
              label={t("categories.moveDown")}
              onPress={() => moveCategory(c.id, 1)}
            />
          </View>
        ))}
      </View>

      <Button
        label={t("categories.add")}
        variant="secondary"
        onPress={() => navigation.navigate("CategoryForm", { type })}
      />

      {builtins.length > 0 ? (
        <>
          <Text style={[typography.label, styles.section]}>
            {t("categories.builtin")}
          </Text>
          <View style={styles.group}>
            {builtins.map((c, i) => (
              <View key={c.id} style={[styles.row, i > 0 && styles.divider]}>
                <View style={styles.rowMain}>
                  <CategoryIcon icon={c.icon} color={c.color} size={36} />
                  <Text
                    style={[typography.body, styles.name]}
                    numberOfLines={1}
                  >
                    {categoryLabel(c)}
                  </Text>
                </View>
                <MaterialCommunityIcons
                  name="lock-outline"
                  size={18}
                  color={colors.textMuted}
                />
              </View>
            ))}
          </View>
          <Text style={typography.caption}>{t("categories.builtinHint")}</Text>
        </>
      ) : null}

      {archived.length > 0 ? (
        <>
          <Pressable
            onPress={() => setShowArchived((v) => !v)}
            style={styles.toggle}
            hitSlop={8}
          >
            <Text style={styles.link}>
              {showArchived
                ? t("categories.hideArchived")
                : t("categories.showArchived", { count: archived.length })}
            </Text>
          </Pressable>
          {showArchived ? (
            <View style={styles.group}>
              {archived.map((c, i) => (
                <Pressable
                  key={c.id}
                  onPress={() => open(c)}
                  style={[styles.row, i > 0 && styles.divider]}
                >
                  <View style={styles.rowMain}>
                    <CategoryIcon
                      icon={c.icon}
                      color={colors.textMuted}
                      size={36}
                    />
                    <Text
                      style={[typography.body, styles.name, styles.muted]}
                      numberOfLines={1}
                    >
                      {categoryLabel(c)}
                    </Text>
                  </View>
                  <Text style={typography.caption}>
                    {t("accounts.archivedBadge")}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}

function MoveButton({
  icon,
  disabled,
  label,
  onPress,
}: {
  icon: IconName;
  disabled: boolean;
  label: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      style={styles.move}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
    >
      <MaterialCommunityIcons
        name={icon}
        size={24}
        color={disabled ? colors.border : colors.primary}
      />
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  screen: { flex: 1, backgroundColor: c.background },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  group: {
    backgroundColor: c.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    minHeight: 56,
  },
  divider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.border,
  },
  rowMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  name: { flex: 1 },
  muted: { color: c.textMuted },
  move: { padding: spacing.xs },
  section: { marginTop: spacing.sm },
  toggle: { alignSelf: "center", padding: spacing.sm },
  link: { color: c.primary, fontWeight: "600" },
}));
