import type { ComponentProps } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors, radius, spacing } from "../theme";

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

interface Props {
  label: string;
  selected?: boolean;
  onPress: () => void;
  icon?: string;
  /** Accent color for the icon, e.g. a category color. */
  color?: string;
}

export default function Chip({
  label,
  selected = false,
  onPress,
  icon,
  color,
}: Props) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.selected,
        pressed && styles.pressed,
      ]}
    >
      {icon ? (
        <MaterialCommunityIcons
          name={icon as IconName}
          size={18}
          color={selected ? colors.onPrimary : (color ?? colors.textMuted)}
        />
      ) : null}
      <Text
        style={[styles.label, selected && styles.labelSelected]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  selected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  pressed: {
    opacity: 0.8,
  },
  label: {
    fontSize: 14,
    color: colors.text,
    maxWidth: 160,
  },
  labelSelected: {
    color: colors.onPrimary,
    fontWeight: "600",
  },
});
