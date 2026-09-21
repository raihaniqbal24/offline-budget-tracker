import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { bootstrap } from "./src/bootstrap";
import AppNavigator from "./src/navigation";
import { colors, spacing, typography } from "./src/theme";

type StartupState =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "error"; message: string };

export default function App() {
  const [state, setState] = useState<StartupState>({ status: "loading" });

  useEffect(() => {
    bootstrap()
      .then(() => setState({ status: "ready" }))
      .catch((error: unknown) =>
        setState({
          status: "error",
          message: error instanceof Error ? error.message : String(error),
        }),
      );
  }, []);

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
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <AppNavigator />
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
});
