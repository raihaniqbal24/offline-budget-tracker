import type { TextStyle } from "react-native";

/**
 * Deep jade primary (a nod to the green Rp 20.000 note), cool neutral
 * surfaces, and three distinct budget warning colors. Amounts use tabular
 * figures so columns of rupiah line up digit for digit.
 */
export const colors = {
  background: "#F3F5F4",
  surface: "#FFFFFF",
  text: "#1C2421",
  textMuted: "#5E6B66",
  border: "#DCE2DF",
  primary: "#0E6B57",
  onPrimary: "#FFFFFF",
  primarySoft: "#DDEEE9",
  expense: "#B3261E",
  income: "#1B7F3B",
  transfer: "#3A5A8C",
  budget75: "#C98A00",
  budget90: "#D8591C",
  budget100: "#B3261E",
  alert: "#B3261E",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
} as const;

const tabular: TextStyle["fontVariant"] = ["tabular-nums"];

export const typography: Record<
  "amountLarge" | "amount" | "title" | "body" | "label" | "caption",
  TextStyle
> = {
  amountLarge: {
    fontSize: 32,
    fontWeight: "700",
    fontVariant: tabular,
    color: colors.text,
  },
  amount: {
    fontSize: 16,
    fontWeight: "600",
    fontVariant: tabular,
    color: colors.text,
  },
  title: { fontSize: 20, fontWeight: "600", color: colors.text },
  body: { fontSize: 16, color: colors.text },
  label: { fontSize: 14, color: colors.textMuted },
  caption: { fontSize: 12, color: colors.textMuted },
};

/** Progress bar color for a budget at `percent` of its limit (FR-7.4). */
export function budgetColor(percent: number): string {
  if (percent >= 100) return colors.budget100;
  if (percent >= 90) return colors.budget90;
  if (percent >= 75) return colors.budget75;
  return colors.primary;
}
