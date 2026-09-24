import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { UNDO_WINDOW_MS, useLedgerStore } from "../store/ledgerStore";
import { colors, radius, spacing } from "../theme";

/** App-wide bar offering undo for 5 seconds after an entry or transfer is deleted (FR-2.7). */
export default function UndoSnackbar() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const undo = useLedgerStore((s) => s.undo);
  const undoDelete = useLedgerStore((s) => s.undoDelete);
  const dismissUndo = useLedgerStore((s) => s.dismissUndo);

  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(() => dismissUndo(undo.token), UNDO_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [undo, dismissUndo]);

  if (!undo) return null;

  return (
    <View
      style={[styles.bar, { bottom: insets.bottom + 72 }]}
      accessibilityLiveRegion="assertive"
    >
      <Text style={styles.text}>
        {undo.kind === "entry" ? t("entries.deleted") : t("transfers.deleted")}
      </Text>
      <Pressable onPress={undoDelete} accessibilityRole="button" hitSlop={12}>
        <Text style={styles.action}>{t("common.undo")}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    left: spacing.md,
    right: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.md,
    minHeight: 48,
    borderRadius: radius.md,
    backgroundColor: colors.text,
    elevation: 6,
  },
  text: { color: colors.surface, fontSize: 15 },
  action: { color: "#7FD3BE", fontSize: 15, fontWeight: "700" },
});
