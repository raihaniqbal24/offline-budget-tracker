import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { bootstrap, resetLocalDatabaseForDevelopment } from "./src/bootstrap";
import AppNavigator from "./src/navigation";
import LockGate from "./src/components/LockGate";
import { ThemeProvider } from "./src/theme/ThemeProvider";
import ThemedChrome from "./src/components/ThemedChrome";
import "./src/widget/register";
import Button from "./src/components/Button";
import { LIGHT as colors, makeTypography, spacing } from "./src/theme";

/** The loading and error screens draw before the theme provider mounts. */
const typography = makeTypography(colors);

type StartupState =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "error"; message: string };

export default function App() {
  const [state, setState] = useState<StartupState>({ status: "loading" });

  const start = useCallback(() => {
    setState({ status: "loading" });
    bootstrap()
      .then(() => setState({ status: "ready" }))
      .catch((error: unknown) =>
        setState({
          status: "error",
          message: error instanceof Error ? error.message : String(error),
        }),
      );
  }, []);

  useEffect(() => {
    start();
  }, [start]);

  const resetAndRetry = useCallback(async () => {
    try {
      await resetLocalDatabaseForDevelopment();
      start();
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, [start]);

  if (state.status === "loading") {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (state.status === "error") {
    // Translations may not be loaded yet, so this screen shows both languages.
    return (
      <View style={styles.center}>
        <Text style={typography.title}>The app couldn't open its data.</Text>
        <Text style={typography.title}>
          Aplikasi tidak dapat membuka datanya.
        </Text>
        <Text style={[typography.label, styles.detail]}>
          Close the app fully and open it again. / Tutup aplikasi lalu buka
          lagi.
        </Text>
        <Text style={[typography.caption, styles.detail]}>{state.message}</Text>
        {__DEV__ ? (
          <View style={styles.devBox}>
            <Button
              label="Reset local database (development only)"
              variant="danger"
              onPress={resetAndRetry}
            />
            <Text style={[typography.caption, styles.detail]}>
              Deletes everything stored in the app on this phone, then starts
              again.
            </Text>
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <ThemeProvider>
        <ThemedChrome />
        <LockGate>
          <AppNavigator />
        </LockGate>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    gap: spacing.sm,
    backgroundColor: colors.background,
  },
  detail: { textAlign: "center" },
  devBox: { alignSelf: "stretch", marginTop: spacing.lg, gap: spacing.sm },
});
