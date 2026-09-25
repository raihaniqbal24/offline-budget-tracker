/**
 * Registers the widget's task handler with React Native's headless runtime.
 * Imported from App.tsx so it runs in the same bundle Android loads when it
 * asks for a widget update, and quietly does nothing where the native module
 * is absent (Expo Go).
 */
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { registerWidgetTaskHandler } =
    require("react-native-android-widget") as typeof import("react-native-android-widget");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { widgetTaskHandler } =
    require("./taskHandler") as typeof import("./taskHandler");
  registerWidgetTaskHandler(widgetTaskHandler);
} catch {
  // No widget support in this runtime.
}

export {};
