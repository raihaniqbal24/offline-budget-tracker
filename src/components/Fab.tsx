import { Pressable, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { spacing } from "../theme";
import { makeStyles, useTheme } from "../theme/ThemeProvider";

/** The round add button; the start of the three-tap quick-add (FR-2.8). */
export default function Fab({
  onPress,
  label,
}: {
  onPress: () => void;
  label: string;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.fab, pressed && styles.pressed]}
    >
      <MaterialCommunityIcons name="plus" size={30} color={colors.onPrimary} />
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  fab: {
    position: "absolute",
    right: spacing.md,
    bottom: spacing.md,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: c.primary,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
  },
  pressed: { opacity: 0.85 },
}));
