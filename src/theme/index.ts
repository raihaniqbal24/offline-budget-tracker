/**
 * Layout constants and the theme tokens. Colours live in tokens.ts and reach
 * screens through ThemeProvider, so nothing here freezes one theme's palette.
 */
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

export {
  budgetColorOf,
  categoryColorOf,
  contrastRatio,
  DARK,
  LIGHT,
  makeTypography,
  PALETTES,
  type ThemeColors,
  type ThemeName,
  type Typography,
} from "./tokens";
