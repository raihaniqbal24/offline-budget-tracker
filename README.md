# Finance Tracker

An offline personal budget tracker for Android. Everything lives in a SQLite
database on the phone: there is no server, no account and no sync, and the
release build doesn't even have the internet permission.

Built with Expo SDK 57, React Native 0.86 and TypeScript. Amounts are in
Indonesian rupiah (IDR), and the interface is available in English and Bahasa
Indonesia.

## Features

- **Accounts**: cash, bank, e-wallet and other, each with an opening balance
  and an optional balance alert line. Balances are always derived from the
  ledger, never stored.
- **Entries**: expenses and income with category, date and note. Amounts accept
  shorthand such as `50k`, `50rb`, `2jt` or `1,5jt`.
- **Transfers** between accounts, with a fee paid by the sender or recipient.
- **Reconcile**: correct an account to its real balance; the difference is
  recorded as an "unrecorded" adjustment.
- **Budgets**: monthly limits per category, per account or overall, with
  alerts at 75%, 90% and 100%.
- **Recurring** expenses, income and transfers (daily, weekly, monthly,
  yearly). Due items wait for you to confirm or skip them.
- **Savings goals**, either linked to an account or tracked by manual
  contributions and releases.
- **Summary** by month, plus search and filter across entries.
- **Backup**: full JSON export and import (replace everything or merge), and a
  CSV export of entries for spreadsheets. Backup files are not encrypted.
- **Notifications**: a daily reminder, a weekly backup reminder, and budget
  and balance alerts.
- **App lock** using the phone's own screen lock, also asked before exporting.
- **Home screen widget** showing the available balance and this month's
  spending against the overall limit. Amounts are masked when the app lock is on.
- **Light and dark themes**, following the phone or chosen in Settings.

## Privacy

- Release builds block `INTERNET`, storage, camera, microphone, location,
  contacts and SMS permissions. The only permission requested is notifications.
- `allowBackup` is off, so Android never copies the database to a Google account.
- The app never stores your PIN or fingerprint; it delegates to the system prompt.

## Requirements

- Node.js and npm
- Android 13 (API 33) or later on the device or emulator
- Android Studio / Android SDK for local builds, or an [EAS](https://expo.dev/eas)
  account for cloud builds

Expo Go is not enough: notifications and the widget need a development build.

## Getting started

```bash
npm install
```

Build and install the development app on a connected device or emulator:

```bash
npm run android
```

Afterwards, start Metro on its own with:

```bash
npm start
```

Alternatively, build the development client in the cloud:

```bash
npx eas build --profile development --platform android
```

The development build is named "Finance Tracker (dev)" and has its own package
id (`com.raihaniqbal24.financetracker.dev`), so it installs alongside the
release app with separate data and a separate widget.

## Scripts

| Command             | What it does                                 |
| ------------------- | -------------------------------------------- |
| `npm start`         | Start the Metro dev server                   |
| `npm run android`   | Build and run the development app on Android |
| `npm test`          | Run the Jest test suites                     |
| `npm run typecheck` | Type-check with `tsc --noEmit`               |

## Project structure

```
App.tsx              Root component
app.json             Base Expo config
app.config.ts        Build variants, permissions, splash, widget, plugins
eas.json             EAS build profiles (development, preview, release)
docs/RELEASE.md      Release checklist
src/
  backup/            JSON backup format, import/export, CSV
  components/        Shared UI components
  db/                SQLite client, migrations and DAOs
  hooks/             Reusable hooks
  i18n/              English and Indonesian translations
  lib/               Pure helpers: money, dates, goals, summaries
  navigation/        Tab and stack navigators
  notifications/     Reminders and alerts
  screens/           One file per screen
  security/          App lock
  store/             Zustand stores (ledger, settings)
  theme/             Design tokens and theme provider
  widget/            Android home screen widget
```

A few conventions worth knowing:

- Money is a whole-rupiah integer everywhere; no floating-point arithmetic.
- Dates that entries are grouped by are local `YYYY-MM-DD` strings; timestamps
  are UTC and never used for grouping.
- Schema changes go in a new file under `src/db/migrations/`; the backup format
  in `src/backup/format.ts` migrates older files to match.

## Releasing

The app is distributed as a directly installed APK:

```bash
npx eas build --profile release --platform android
```

Always use the `release` profile for anything you hand out: it sets
`APP_VARIANT=release`, which is what removes the internet permission. See
[docs/RELEASE.md](docs/RELEASE.md) for the full checklist, including the
pre-build checks and versioning.
