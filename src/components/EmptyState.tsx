import type { ComponentProps } from "react";
import { StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors, spacing, typography } from "../theme";
import Button from "./Button";

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

interface Props {
  icon: IconName;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export default function EmptyState({
  icon,
  title,
  body,
  actionLabel,
  onAction,
}: Props) {
  return (
    <View style={styles.container}>
      <MaterialCommunityIcons name={icon} size={44} color={colors.textMuted} />
      <Text style={[typography.title, styles.center]}>{title}</Text>
      {body ? (
        <Text style={[typography.label, styles.center]}>{body}</Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} style={styles.action} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    padding: spacing.lg,
    gap: spacing.sm,
  },
  center: {
    textAlign: "center",
  },
  action: {
    marginTop: spacing.sm,
    alignSelf: "stretch",
  },
});
