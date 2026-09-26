import { Pressable, StyleSheet, Text, View } from "react-native";
import { radius, spacing } from "../theme";
import { makeStyles } from "../theme/ThemeProvider";

interface Props<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

/** A row of equal-width options with one selected, e.g. Day / Week / Month / Year. */
export default function Segmented<T extends string>({
  options,
  value,
  onChange,
}: Props<T>) {
  const styles = useStyles();
  return (
    <View style={styles.track} accessibilityRole="tablist">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[styles.option, selected && styles.selected]}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
          >
            <Text
              style={[styles.label, selected && styles.labelSelected]}
              numberOfLines={1}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  track: {
    flexDirection: "row",
    padding: 3,
    borderRadius: radius.md,
    backgroundColor: c.border,
  },
  option: {
    flex: 1,
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xs,
  },
  selected: { backgroundColor: c.surface, elevation: 1 },
  label: { fontSize: 14, color: c.textMuted, fontWeight: "500" },
  labelSelected: { color: c.text, fontWeight: "700" },
}));
