import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { authenticate } from "../security/deviceLock";
import {
  onAppStatus,
  onAuthResult,
  onRetry,
  onSettingChanged,
  onStart,
  type LockState,
  type Transition,
} from "../security/lockPolicy";
import { useSettingsStore } from "../store/settingsStore";
import { spacing } from "../theme";
import { makeStyles, useTheme } from "../theme/ThemeProvider";
import Button from "./Button";

/**
 * FR-13.2: sits above navigation, so no screen is drawn before the phone's
 * lock has been passed. With the setting off it renders its children and does
 * nothing else (FR-13.10).
 */
export default function LockGate({ children }: { children: ReactNode }) {
  const { colors, typography } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const enabled = useSettingsStore((s) => s.appLockEnabled);
  const [state, setState] = useState<LockState>(() => onStart(enabled).state);
  const [failed, setFailed] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  const apply = useCallback(async (transition: Transition) => {
    setState(transition.state);
    if (!transition.prompt) return;
    const ok = await authenticate("open");
    setFailed(!ok);
    setState(onAuthResult(ok).state);
  }, []);

  // Ask once when the app opens with the lock on.
  useEffect(() => {
    void apply(onStart(useSettingsStore.getState().appLockEnabled));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Follow the setting while the app is running.
  useEffect(() => {
    setState(onSettingChanged(enabled, stateRef.current).state);
  }, [enabled]);

  // Lock on leaving, ask on returning (FR-13.2).
  useEffect(() => {
    const sub = AppState.addEventListener("change", (status) => {
      void apply(
        onAppStatus(
          status as "active" | "background" | "inactive",
          enabled,
          stateRef.current,
        ),
      );
    });
    return () => sub.remove();
  }, [apply, enabled]);

  if (!enabled || !state.locked) return <>{children}</>;

  return (
    <View style={styles.screen}>
      <MaterialCommunityIcons
        name="lock-outline"
        size={48}
        color={colors.primary}
      />
      <Text style={typography.title}>{t("lock.title")}</Text>
      <Text style={[typography.body, styles.body]}>
        {failed ? t("lock.failed") : t("lock.body")}
      </Text>
      <Button
        label={t("lock.unlock")}
        onPress={() => void apply(onRetry(stateRef.current))}
        style={styles.button}
      />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  screen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.xl,
    backgroundColor: c.background,
  },
  body: { textAlign: "center" },
  button: { alignSelf: "stretch", marginTop: spacing.md },
}));
