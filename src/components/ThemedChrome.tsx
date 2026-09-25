import { useEffect } from "react";
import { Platform, StatusBar } from "react-native";
import * as SystemUI from "expo-system-ui";
import { useTheme } from "../theme/ThemeProvider";

/**
 * FR-15.4: the system bars follow the theme too. The status bar's icons flip
 * between dark and light, and the window background behind the app changes so
 * neither a screen transition nor the area under the navigation bar flashes
 * the other theme.
 */
export default function ThemedChrome() {
  const { name, colors } = useTheme();

  useEffect(() => {
    StatusBar.setBarStyle(
      name === "dark" ? "light-content" : "dark-content",
      true,
    );
    if (Platform.OS === "android") {
      StatusBar.setBackgroundColor(colors.background, true);
    }
    void SystemUI.setBackgroundColorAsync(colors.background).catch(() => {
      // Not fatal: the app is themed either way.
    });
  }, [name, colors]);

  return null;
}
