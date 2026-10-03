import { useContext, useEffect, useState, type ReactNode } from "react";
import { Keyboard, View, type StyleProp, type ViewStyle } from "react-native";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";
import { spacing } from "../theme";

/**
 * The root of a form screen. The app draws edge to edge, so Android lays the
 * keyboard over the screen instead of shrinking it; this adds bottom padding
 * equal to the part the keyboard covers, which keeps the focused field and
 * the Save button in view.
 *
 * Only for screens that reach the bottom edge of the window (stack screens,
 * not tabs). The padding is counted up from that edge: the screen's position
 * as measured from the top is unreliable under a native header.
 */
export default function KeyboardAvoider({
  style,
  children,
}: {
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  // Android reports the keyboard height without the navigation bar under it.
  const navigationBar = useContext(SafeAreaInsetsContext)?.bottom ?? 0;
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", (event) =>
      setKeyboardHeight(event.endCoordinates.height),
    );
    const hide = Keyboard.addListener("keyboardDidHide", () =>
      setKeyboardHeight(0),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // A small gap, so the form doesn't look glued to the keyboard.
  const covered =
    keyboardHeight > 0 ? keyboardHeight + navigationBar + spacing.md : 0;

  return <View style={[style, { paddingBottom: covered }]}>{children}</View>;
}
