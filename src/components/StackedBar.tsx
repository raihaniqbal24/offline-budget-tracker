import { StyleSheet, View } from "react-native";
import { colors, radius } from "../theme";

/**
 * Category breakdown chart (FR-3.4): one bar split by share. On a narrow
 * screen this reads more precisely than a donut, and the ranked list under
 * it carries the exact numbers.
 */
export default function StackedBar({ slices }: { slices: { key: string | number; value: number; color: string }[] }) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  if (total <= 0) return <View style={[styles.bar, styles.empty]} />;
  return (
    <View style={styles.bar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {slices
        .filter((s) => s.value > 0)
        .map((s, i) => (
          <View key={s.key} style={{ flex: s.value, backgroundColor: s.color, marginLeft: i === 0 ? 0 : 2 }} />
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    height: 14,
    borderRadius: radius.sm,
    overflow: "hidden",
  },
  empty: {
    backgroundColor: colors.border,
  },
});