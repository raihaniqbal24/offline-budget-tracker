import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * Build settings on top of app.json.
 *
 * Release builds (APP_VARIANT=release, used in phase 6 for the shared APK)
 * also block the internet permission (NFR-3). Development builds keep it,
 * because they load the app from your computer over the network.
 * Expo Go ignores this file; it only matters for real builds.
 */
/**
 * Which build this is. The release profile in eas.json sets "release"; the
 * development profile sets "development", which is also the default when you
 * run Metro locally.
 *
 * A development build installs alongside the release app rather than over it:
 * it has its own package id, so the two keep separate data and separate
 * widgets, and testing never disturbs the app you actually use.
 */
const variant =
  process.env.APP_VARIANT === "release" ? "release" : "development";
const isRelease = variant === "release";

/**
 * FR-15.4: the splash screen has a light and a dark version. Android draws it
 * before any app code runs, so it follows the phone's own dark mode setting:
 * a Dark or Light choice made inside the app takes effect from the first
 * screen onward.
 *
 * Configured here rather than in app.json, so there is exactly one entry.
 */
const SPLASH: [string, Record<string, unknown>] = [
  "expo-splash-screen",
  {
    image: "./assets/splash-icon.png",
    imageWidth: 220,
    resizeMode: "contain",
    backgroundColor: "#F0F9F9",
    dark: {
      image: "./assets/splash-icon-dark.png",
      backgroundColor: "#101613",
    },
  },
];

/** Any splash entry in app.json is replaced by the one above. */
function withoutSplash(
  plugins: ExpoConfig["plugins"] = [],
): NonNullable<ExpoConfig["plugins"]> {
  return plugins.filter(
    (p) => (Array.isArray(p) ? p[0] : p) !== "expo-splash-screen",
  );
}

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  // The name under the icon and in the app switcher.
  name: isRelease ? "Finance Tracker" : "Finance Tracker (dev)",
  // The slug ties the project to its EAS build history: leave it alone.
  slug: config.slug ?? "budget-tracker",
  // FR-15.2: without this, Android never tells the app the phone is in dark mode.
  userInterfaceStyle: "automatic",
  android: {
    ...config.android,
    // Permanent for the release app: changing it after anyone installs makes
    // it a different app. The development build uses its own id.
    package: isRelease
      ? "com.raihaniqbal24.financetracker"
      : "com.raihaniqbal24.financetracker.dev",
    // NFR-5: never copy the database to a Google account.
    allowBackup: false,
    permissions: ["android.permission.POST_NOTIFICATIONS"],
    blockedPermissions: [
      // NFR-12: approximate reminder timing only.
      "android.permission.SCHEDULE_EXACT_ALARM",
      "android.permission.USE_EXACT_ALARM",
      // SRS external interfaces: no storage, camera, location, contacts or SMS.
      "android.permission.READ_EXTERNAL_STORAGE",
      "android.permission.WRITE_EXTERNAL_STORAGE",
      "android.permission.CAMERA",
      "android.permission.RECORD_AUDIO",
      "android.permission.ACCESS_FINE_LOCATION",
      "android.permission.ACCESS_COARSE_LOCATION",
      "android.permission.READ_CONTACTS",
      "android.permission.READ_SMS",
      ...(isRelease ? ["android.permission.INTERNET"] : []),
    ],
  },
  plugins: [
    ...withoutSplash(config.plugins),
    SPLASH,
    // Decided: Android 13 (API level 33) and later.
    ["expo-build-properties", { android: { minSdkVersion: 33 } }],
    [
      "expo-notifications",
      { icon: "./assets/notification-icon.png", color: "#0E6B57" },
    ],
    // FR-14: the home screen widget. Android redraws it at most every 30
    // minutes on its own; the app asks for an update after every change.
    [
      "react-native-android-widget",
      {
        widgets: [
          {
            name: "FinanceTracker",
            label: isRelease ? "Finance Tracker" : "Finance Tracker (dev)",
            description: "Balance and this month's budget",
            minWidth: "180dp",
            minHeight: "110dp",
            targetCellWidth: 3,
            targetCellHeight: 2,
            resizeMode: "horizontal|vertical",
            previewImage: "./assets/widget-preview.png",
            updatePeriodMillis: 1800000,
          },
        ],
      },
    ],
  ],
});
