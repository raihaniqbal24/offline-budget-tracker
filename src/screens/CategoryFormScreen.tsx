import { useMemo, useState, type ComponentProps } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { categoryLabel } from "../i18n";
import { useLedgerStore } from "../store/ledgerStore";
import { radius, spacing } from "../theme";
import { makeStyles, useTheme } from "../theme/ThemeProvider";
import type { CategoryType } from "../types";
import type { RootStackParamList } from "../navigation/types";
import Button from "../components/Button";
import KeyboardAvoider from "../components/KeyboardAvoider";
import CategoryIcon from "../components/CategoryIcon";
import Segmented from "../components/Segmented";
import { CATEGORY_COLORS, CATEGORY_ICONS } from "../components/categoryPalette";

type Props = NativeStackScreenProps<RootStackParamList, "CategoryForm">;
type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

/** Add or edit a category (FR-6.1, FR-6.2), and archive or restore it (FR-6.3). */
export default function CategoryFormScreen({ route, navigation }: Props) {
  const { colors, typography } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const categoryId = route.params?.categoryId;
  const categories = useLedgerStore((s) => s.categories);
  const saveCategory = useLedgerStore((s) => s.saveCategory);
  const setArchived = useLedgerStore((s) => s.setCategoryArchived);
  const existing = useMemo(
    () => categories.find((c) => c.id === categoryId),
    [categories, categoryId],
  );

  const originalLabel = existing ? categoryLabel(existing) : "";
  const [name, setName] = useState(originalLabel);
  const [type, setType] = useState<CategoryType>(
    existing?.type ?? route.params?.type ?? "expense",
  );
  const [icon, setIcon] = useState<string>(existing?.icon ?? CATEGORY_ICONS[0]);
  const [color, setColor] = useState<string>(
    existing?.color ?? CATEGORY_COLORS[0],
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const trimmed = name.trim();
    if (trimmed.length === 0) return setError(t("categories.nameRequired"));
    // Compare against the names people actually see, in either language's stored form.
    const clash = categories.some(
      (c) =>
        c.id !== categoryId &&
        c.type === type &&
        [c.name, categoryLabel(c)].some(
          (n) => n.trim().toLowerCase() === trimmed.toLowerCase(),
        ),
    );
    if (clash) return setError(t("categories.duplicate"));

    setError(null);
    setSaving(true);
    try {
      await saveCategory(
        { name: trimmed, type, icon, color },
        categoryId,
        trimmed !== originalLabel,
      );
      navigation.goBack();
    } catch (e) {
      const code = (e as Error).message;
      setError(
        code === "duplicate_name"
          ? t("categories.duplicate")
          : t("errors.saveFailed", { message: code }),
      );
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
        <View style={styles.preview}>
          <CategoryIcon icon={icon} color={color} size={56} />
          <Text style={typography.title} numberOfLines={1}>
            {name.trim() || t("categories.namePlaceholder")}
          </Text>
        </View>

        {!existing ? (
          <Segmented
            options={[
              { value: "expense", label: t("categories.expense") },
              { value: "income", label: t("categories.income") },
            ]}
            value={type}
            onChange={setType}
          />
        ) : null}

        <Text style={[typography.label, styles.label]}>
          {t("categories.name")}
        </Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={t("categories.namePlaceholder")}
          placeholderTextColor={colors.textMuted}
          style={[styles.textInput, error ? styles.inputError : null]}
          autoFocus={!existing}
          maxLength={30}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Text style={[typography.label, styles.label]}>
          {t("categories.icon")}
        </Text>
        <View style={styles.grid}>
          {CATEGORY_ICONS.map((name) => (
            <Pressable
              key={name}
              onPress={() => setIcon(name)}
              style={[
                styles.iconCell,
                icon === name && {
                  borderColor: color,
                  backgroundColor: `${color}22`,
                },
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: icon === name }}
            >
              <MaterialCommunityIcons
                name={name as IconName}
                size={24}
                color={icon === name ? color : colors.textMuted}
              />
            </Pressable>
          ))}
        </View>

        <Text style={[typography.label, styles.label]}>
          {t("categories.color")}
        </Text>
        <View style={styles.grid}>
          {CATEGORY_COLORS.map((c) => (
            <Pressable
              key={c}
              onPress={() => setColor(c)}
              style={[
                styles.swatch,
                { backgroundColor: c },
                color === c && styles.swatchSelected,
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: color === c }}
            >
              {color === c ? (
                <MaterialCommunityIcons
                  name="check"
                  size={20}
                  color="#FFFFFF"
                />
              ) : null}
            </Pressable>
          ))}
        </View>

        {existing ? (
          <View style={styles.archiveBox}>
            <Button
              label={
                existing.archived
                  ? t("categories.restore")
                  : t("categories.archive")
              }
              variant="secondary"
              onPress={toggleArchived}
            />
            <Text style={typography.caption}>
              {t("categories.archiveHint")}
            </Text>
          </View>
        ) : null}
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
  preview: {
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
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
  error: { fontSize: 13, color: c.expense },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  iconCell: {
    width: 48,
    height: 48,
    flexShrink: 0,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: c.border,
    backgroundColor: c.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  swatch: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  swatchSelected: { borderWidth: 3, borderColor: c.text },
  archiveBox: { marginTop: spacing.xl, gap: spacing.sm },
  footer: {
    padding: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.border,
    backgroundColor: c.surface,
  },
}));
