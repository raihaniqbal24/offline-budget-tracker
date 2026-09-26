import type { TextStyle } from "react-native";

/**
 * Theme tokens (FR-15). Every colour a screen uses comes from here, so a
 * screen is themed by using the tokens rather than literal values.
 *
 * The dark palette is not the light one inverted: surfaces are dark grey-green
 * rather than black, and the accent colours are lightened until they pass the
 * contrast requirement (NFR-14) on those surfaces.
 */
export type ThemeName = "light" | "dark";

export interface ThemeColors {
  background: string;
  surface: string;
  text: string;
  textMuted: string;
  border: string;
  primary: string;
  onPrimary: string;
  primarySoft: string;
  expense: string;
  income: string;
  transfer: string;
  budget75: string;
  budget90: string;
  budget100: string;
  alert: string;
  /** Behind bars and charts, where a filled colour sits on top. */
  track: string;
  /** The undo bar, which deliberately contrasts with the screen behind it. */
  inverseSurface: string;
  inverseText: string;
  inverseAccent: string;
  /** Behind a cautionary note, such as blocked notifications. */
  warningSurface: string;
}

export const LIGHT: ThemeColors = {
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
  track: "#E6EFEC",
  inverseSurface: "#1C2421",
  inverseText: "#FFFFFF",
  inverseAccent: "#7FD3BE",
  warningSurface: "#FDF3E1",
};

export const DARK: ThemeColors = {
  background: "#101613",
  surface: "#19211E",
  text: "#EAF1ED",
  textMuted: "#A4B3AD",
  border: "#2C3733",
  primary: "#4FC3A1",
  onPrimary: "#0B1512",
  primarySoft: "#1E332C",
  expense: "#FF8A80",
  income: "#7BD88F",
  transfer: "#8FB2E8",
  budget75: "#F2C14E",
  budget90: "#F59A5B",
  budget100: "#FF8A80",
  alert: "#FF8A80",
  track: "#243029",
  inverseSurface: "#EAF1ED",
  inverseText: "#101613",
  inverseAccent: "#0B5C4A",
  warningSurface: "#2E2718",
};

export const PALETTES: Record<ThemeName, ThemeColors> = {
  light: LIGHT,
  dark: DARK,
};

const tabular: TextStyle["fontVariant"] = ["tabular-nums"];

export type TypographyKey =
  | "amountLarge"
  | "amount"
  | "title"
  | "body"
  | "label"
  | "caption";
export type Typography = Record<TypographyKey, TextStyle>;

export function makeTypography(c: ThemeColors): Typography {
  return {
    amountLarge: {
      fontSize: 32,
      fontWeight: "700",
      fontVariant: tabular,
      color: c.text,
    },
    amount: {
      fontSize: 16,
      fontWeight: "600",
      fontVariant: tabular,
      color: c.text,
    },
    title: { fontSize: 20, fontWeight: "600", color: c.text },
    body: { fontSize: 16, color: c.text },
    label: { fontSize: 14, color: c.textMuted },
    caption: { fontSize: 12, color: c.textMuted },
  };
}

/** Progress bar colour for a budget at `percent` of its limit (FR-7.4, FR-15.5). */
export function budgetColorOf(c: ThemeColors, percent: number): string {
  if (percent >= 100) return c.budget100;
  if (percent >= 90) return c.budget90;
  if (percent >= 75) return c.budget75;
  return c.primary;
}

/**
 * FR-15.5: the colour a user picked for a category must stay recognisable in
 * both themes. On dark surfaces the chosen colour is lightened just enough to
 * read, keeping its hue.
 */
export function categoryColorOf(hex: string, theme: ThemeName): string {
  if (theme === "light") return hex;
  const [r, g, b] = hexToRgb(hex);
  const [h, s, l] = rgbToHsl(r, g, b);
  return hslToHex(h, Math.min(s, 0.72), Math.max(l, 0.62));
}

export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((ch) => ch + ch)
          .join("")
      : clean;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const [rn, gn, bn] = [r / 255, g / 255, b / 255];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === rn
      ? ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6
      : max === gn
        ? ((bn - rn) / d + 2) / 6
        : ((rn - gn) / d + 4) / 6;
  return [h, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const value = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(value * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** Relative luminance, per WCAG. */
function luminance(hex: string): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two colours, from 1 to 21 (NFR-14). */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}
