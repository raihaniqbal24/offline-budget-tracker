# Releasing Finance Tracker

The app is shared as an APK that people install directly. There is no server,
no account and no Play Store listing.

| Setting | Value |
| --- | --- |
| Package id | `com.raihaniqbal24.financetracker` (permanent) |
| Display name | Finance Tracker |
| Minimum Android | 13 (API 33) |
| Signing | Keystore held by EAS. Back it up: `npx eas credentials` |

## Before building

```bash
npm ci                # the same install EAS runs
npm run typecheck     # no output
npm test              # 18 suites, 173 tests
```

EAS uploads your working directory, skipping anything in `.gitignore`, so
commit first if you want the build traceable to a commit.

## Build

```bash
npx eas build --profile release --platform android
```

The `release` profile sets `APP_VARIANT=release`, which is what removes the
internet permission (NFR-3). A build made with the `preview` or `development`
profile keeps it, so always use `release` for something you hand out.

Install the resulting APK on a phone running Android 13 or later.

## Checks on the release build

1. **Permissions (NFR-3, NFR-5, NFR-12).** Locally:
   ```bash
   APP_VARIANT=release npx expo prebuild --platform android --no-install
   grep -E "INTERNET|EXACT_ALARM|allowBackup" android/app/src/main/AndroidManifest.xml
   ```
   Expect `INTERNET` and both exact-alarm permissions marked
   `tools:node="remove"`, and `android:allowBackup="false"`.
   On the phone: Settings → Apps → Finance Tracker → Permissions shows only
   notifications.
2. **Airplane mode (NFR-3).** Turn it on and use the app for a few minutes:
   entries, summaries, backup, import. Nothing should fail or hang.
3. **Force close (NFR-7).** Save an entry, swipe the app away immediately,
   reopen it. The entry is there.
4. **Upgrade path (NFR-8).** Install the new APK over an older version with
   data in it. Everything survives; Settings shows the database version.
5. **Backup round trip (FR-9).** Export, uninstall, reinstall, import with
   **Replace all**. Balances match what they were.

## Sharing it

Send the APK link, or the file itself. The phone will warn about installing
from an unknown source, which is expected for a directly shared app. Tell
people to keep the file, since there is no automatic update.

## Updating later

Bump `expo.version` in `app.json`, and Android requires a higher
`android.versionCode` for an install to replace an older one. Build with the
same profile and the same keystore, then share the new APK.

## If Play Store ever happens

Use the same keystore, upload it during Play App Signing setup, and switch
the release profile from `apk` to the default App Bundle. Play also needs a
privacy policy URL and the data safety form, which is short here: no data
collected, no data shared, everything stays on the device.
