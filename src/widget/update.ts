/**
 * Recalculates the widget's numbers from the same places the app's own
 * screens use, so the two can never disagree, then asks Android to redraw
 * any widget on the home screen (FR-14.6).
 */
import type { SQLiteDatabase } from "expo-sqlite";
import { listAccountsWithBalances } from "../db/accountsDao";
import { getBudgetProgress } from "../db/budgetsDao";
import { currentLanguage } from "../i18n";
import { resolveTheme } from "../theme/ThemeProvider";
import { monthKey, today, type ISODate } from "../lib/dates";
import { writeSummary } from "./storage";
import { SUMMARY_VERSION, WIDGET_NAME, type WidgetSummary } from "./summary";

/** FR-14.1, FR-14.2: active accounts only; money in goals is not included. */
export async function buildSummary(
  db: SQLiteDatabase,
  todayDate: ISODate,
  options: { masked: boolean; language: "en" | "id"; theme: "light" | "dark" },
): Promise<WidgetSummary> {
  const month = monthKey(todayDate);
  const accounts = await listAccountsWithBalances(db, todayDate);
  const balance = accounts
    .filter((a) => !a.archived)
    .reduce((sum, a) => sum + a.balance, 0);
  const overall = (await getBudgetProgress(db, month, todayDate)).find(
    (b) => b.scope === "overall",
  );

  return {
    version: SUMMARY_VERSION,
    language: options.language,
    theme: options.theme,
    masked: options.masked,
    month,
    updatedOn: todayDate,
    balance,
    spent: overall?.spent ?? (await spendingThisMonth(db, month, todayDate)),
    limit: overall?.limit ?? null,
  };
}

/** Month spending when no overall limit exists, so the widget can still show it. */
async function spendingThisMonth(
  db: SQLiteDatabase,
  month: string,
  todayDate: ISODate,
): Promise<number> {
  const row = await db.getFirstAsync<{ spent: number }>(
    `SELECT COALESCE(SUM(amount), 0) AS spent FROM v_cashflow
      WHERE flow = 'spending' AND occurred_on BETWEEN ? AND ?`,
    `${month}-01`,
    todayDate,
  );
  return row?.spent ?? 0;
}

/**
 * Called after every change to balances or this month's spending, and when
 * the app lock is switched (masking). Failures are swallowed: a widget
 * problem must never stop a save (FR-14.9).
 */
export async function updateWidget(
  db: SQLiteDatabase,
  masked: boolean,
): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Appearance } =
      require("react-native") as typeof import("react-native");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useSettingsStore } =
      require("../store/settingsStore") as typeof import("../store/settingsStore");
    const theme = resolveTheme(
      useSettingsStore.getState().theme,
      Appearance.getColorScheme(),
    );
    const summary = await buildSummary(db, today(), {
      masked,
      language: currentLanguage(),
      theme,
    });
    await writeSummary(summary);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { requestWidgetUpdate } =
      require("react-native-android-widget") as typeof import("react-native-android-widget");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { BalanceWidget } =
      require("./BalanceWidget") as typeof import("./BalanceWidget");
    await requestWidgetUpdate({
      widgetName: WIDGET_NAME,
      renderWidget: () => BalanceWidget({ summary, todayDate: today() }),
      widgetNotFound: () => {
        // Nothing on the home screen: the stored file is enough (FR-14.9).
      },
    });
  } catch {
    // Expo Go, or no widget support: the app carries on.
  }
}
