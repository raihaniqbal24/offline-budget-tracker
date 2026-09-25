import { createContext, useContext, useMemo, type ReactNode } from "react";
import {
  StyleSheet,
  useColorScheme,
  type ImageStyle,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { useSettingsStore } from "../store/settingsStore";
import {
  budgetColorOf,
  categoryColorOf,
  makeTypography,
  PALETTES,
  type ThemeColors,
  type ThemeName,
  type Typography,
} from "./tokens";

export type ThemeSetting = "system" | "light" | "dark";

interface Theme {
  name: ThemeName;
  colors: ThemeColors;
  typography: Typography;
}

/** FR-15.2: on System, the phone decides, including when it changes on a schedule. */
export function resolveTheme(
  setting: ThemeSetting,
  phone: string | null | undefined,
): ThemeName {
  if (setting === "light" || setting === "dark") return setting;
  return phone === "dark" ? "dark" : "light";
}

function themeFor(name: ThemeName): Theme {
  const colors = PALETTES[name];
  return { name, colors, typography: makeTypography(colors) };
}

const ThemeContext = createContext<Theme>(themeFor("light"));

/**
 * FR-15.3: the stored choice is read during start-up, before the first screen
 * is drawn, so nothing flashes the wrong theme.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const setting = useSettingsStore((s) => s.theme);
  const phone = useColorScheme();
  const theme = useMemo(
    () => themeFor(resolveTheme(setting, phone)),
    [setting, phone],
  );
  return (
    <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

export function useThemeColors(): ThemeColors {
  return useContext(ThemeContext).colors;
}

/** Progress bar colour for a budget at `percent`, in the current theme. */
export function useBudgetColor(): (percent: number) => string {
  const colors = useThemeColors();
  return (percent) => budgetColorOf(colors, percent);
}

/** A category's colour, adjusted for readability in the current theme (FR-15.5). */
export function useCategoryColor(): (hex: string) => string {
  const { name } = useTheme();
  return (hex) => categoryColorOf(hex, name);
}

type Styles = Record<string, ViewStyle | TextStyle | ImageStyle>;

/**
 * Builds a component's styles from the theme. Replaces a module-level
 * StyleSheet.create, which would freeze one theme's colours at import time.
 * The result is cached per theme, so a re-render doesn't rebuild it.
 */
export function makeStyles<T extends Styles>(factory: (c: ThemeColors) => T) {
  const cache = new Map<ThemeName, T>();
  return function useStyles(): T {
    const { name, colors } = useTheme();
    return useMemo(() => {
      const cached = cache.get(name);
      if (cached) return cached;
      const created = StyleSheet.create(factory(colors)) as T;
      cache.set(name, created);
      return created;
    }, [name, colors]);
  };
}
