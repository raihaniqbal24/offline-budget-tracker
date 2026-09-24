import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * Build settings on top of app.json.
 *
 * Release builds (APP_VARIANT=release, used in phase 6 for the shared APK)
 * also block the internet permission (NFR-3). Development builds keep it,
 * because they load the app from your computer over the network.
 * Expo Go ignores this file; it only matters for real builds.
 */
const isRelease = process.env.APP_VARIANT === "release";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  // The name under the icon and in the app switcher.
  name: "Finance Tracker",
  // The slug ties the project to its EAS build history: leave it alone.
  slug: config.slug ?? "budget-tracker",
  android: {
    ...config.android,
    // Permanent: changing it after anyone installs makes it a different app.
    package: "com.raihaniqbal24.financetracker",
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
    ["expo-notifications", { color: "#0E6B57" }],
  ],
});
