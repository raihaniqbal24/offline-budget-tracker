import type { ConfigContext, ExpoConfig } from "expo/config";

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

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  // The name under the icon and in the app switcher.
  name: isRelease ? "Finance Tracker" : "Finance Tracker (dev)",
  // The slug ties the project to its EAS build history: leave it alone.
  slug: config.slug ?? "budget-tracker",
  android: {
    ...config.android,
    // Permanent: changing it after anyone installs makes it a different app.
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
    ...(config.plugins ?? []),
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
