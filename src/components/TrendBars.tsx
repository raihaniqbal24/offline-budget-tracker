import { StyleSheet, Text, View } from "react-native";
import type { TrendBar } from "../lib/summary";
import { colors, spacing } from "../theme";

interface Props {
  bars: TrendBar[];
  /** Axis label for a bar, or null to leave it blank. */
  labelFor: (bar: TrendBar, index: number) => string | null;
  /** Bar to emphasise, e.g. today. */
  highlightKey?: string;
  height?: number;
}

/** Spending per day or per month (FR-3.5), drawn with plain views. */
export default function TrendBars({ bars, labelFor, highlightKey, height = 120 }: Props) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.plot, { height }]}>
        {bars.map((bar) => (
          <View key={bar.key} style={styles.slot}>
            <View
              style={[
                styles.bar,
                {
                  height: bar.value > 0 ? Math.max(2, (bar.value / max) * height) : 0,
                  backgroundColor: bar.key === highlightKey ? colors.primary : colors.primarySoft,
                },
              ]}
            />
          </View>
        ))}
      </View>
      <View style={styles.axis}>
        {bars.map((bar, i) => (
          <Text key={bar.key} style={styles.label} numberOfLines={1}>
            {labelFor(bar, i) ?? ""}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  plot: {
    flexDirection: "row",
    alignItems: "flex-end",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  slot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingHorizontal: 1,
  },
  bar: {
    width: "80%",
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
  axis: {
    flexDirection: "row",
    marginTop: spacing.xs,
  },
  label: {
    flex: 1,
    textAlign: "center",
    fontSize: 10,
    color: colors.textMuted,
  },
});