/**
 * What the widget shows (FR-14). The widget runs outside the JavaScript app
 * and can't query SQLite, so the app stores these few numbers and the widget
 * reads only them. Everything here is pure, so the same figures can be
 * checked against the app's own balance and budget calculations.
 */
import { monthKey, type ISODate, type MonthKey } from "../lib/dates";
import { formatRupiah, type AppLanguage } from "../lib/money";

export const WIDGET_NAME = "FinanceTracker";
export const SUMMARY_VERSION = 1;

export interface WidgetSummary {
  version: number;
  language: AppLanguage;
  /** FR-14.4: the app lock is on, so amounts are replaced with dots. */
  masked: boolean;
  /** The month the spending figure belongs to. */
  month: MonthKey;
  /** The day the app last wrote this. */
  updatedOn: ISODate;
  /** FR-14.2: active accounts only, with money in goals left out. */
  balance: number;
  spent: number;
  /** FR-14.3: null when no overall limit is set for the month. */
  limit: number | null;
}

/** Small, self-contained strings: the widget renders without i18next. */
const STRINGS = {
  en: {
    balance: "Available in accounts",
    spent: "Spent this month",
    noLimit: "No overall limit set",
    of: "of",
    asOf: "as of",
    lastMonth: "last month",
  },
  id: {
    balance: "Tersedia di akun",
    spent: "Pengeluaran bulan ini",
    noLimit: "Belum ada batas keseluruhan",
    of: "dari",
    asOf: "per",
    lastMonth: "bulan lalu",
  },
} as const;

const MASK = "••••••";

const MONTHS = {
  en: [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ],
  id: [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "Mei",
    "Jun",
    "Jul",
    "Agu",
    "Sep",
    "Okt",
    "Nov",
    "Des",
  ],
} as const;

function shortDate(date: ISODate, language: AppLanguage): string {
  const [, m, d] = date.split("-").map(Number);
  return `${d} ${MONTHS[language][m - 1]}`;
}

export interface WidgetView {
  balanceLabel: string;
  balanceText: string;
  spentLabel: string;
  /** "Rp 750.000 of Rp 2.000.000", or the spent amount alone with no limit. */
  spentText: string;
  /** null hides the bar: no limit set, or amounts are masked (FR-14.4). */
  percent: number | null;
  noLimitText: string | null;
  /** Always shown, so a figure from before a month rollover is never misread. */
  asOfText: string;
}

/**
 * Turn the stored summary into the lines the widget draws. `todayDate` is
 * read at render time, so once the month rolls over the widget says the
 * figure is from last month until the app next writes.
 */
export function widgetView(
  summary: WidgetSummary,
  todayDate: ISODate,
): WidgetView {
  const s = STRINGS[summary.language] ?? STRINGS.en;
  const stale = summary.month !== monthKey(todayDate);
  const money = (amount: number) =>
    summary.masked ? MASK : formatRupiah(amount, summary.language);

  const spentText =
    summary.limit === null
      ? money(summary.spent)
      : `${money(summary.spent)} ${s.of} ${money(summary.limit)}`;

  return {
    balanceLabel: s.balance,
    balanceText: money(summary.balance),
    spentLabel: stale ? `${s.spent} (${s.lastMonth})` : s.spent,
    spentText,
    percent:
      summary.masked || summary.limit === null || summary.limit <= 0
        ? null
        : Math.min(100, Math.floor((summary.spent * 100) / summary.limit)),
    noLimitText: summary.limit === null && !summary.masked ? s.noLimit : null,
    asOfText: `${s.asOf} ${shortDate(summary.updatedOn, summary.language)}`,
  };
}

/** Shown before the app has ever written a summary, or if the file is unreadable. */
export function emptySummary(
  language: AppLanguage,
  todayDate: ISODate,
): WidgetSummary {
  return {
    version: SUMMARY_VERSION,
    language,
    masked: false,
    month: monthKey(todayDate),
    updatedOn: todayDate,
    balance: 0,
    spent: 0,
    limit: null,
  };
}

/** Rejects anything that isn't a summary this version understands. */
export function parseSummary(raw: unknown): WidgetSummary | null {
  if (typeof raw !== "object" || raw === null) return null;
  const s = raw as Partial<WidgetSummary>;
  const numbersOk = [s.balance, s.spent].every(
    (n) => typeof n === "number" && Number.isFinite(n),
  );
  if (s.version !== SUMMARY_VERSION || !numbersOk) return null;
  if (typeof s.month !== "string" || typeof s.updatedOn !== "string")
    return null;
  if (s.limit !== null && typeof s.limit !== "number") return null;
  return {
    version: SUMMARY_VERSION,
    language: s.language === "id" ? "id" : "en",
    masked: s.masked === true,
    month: s.month,
    updatedOn: s.updatedOn,
    balance: s.balance as number,
    spent: s.spent as number,
    limit: (s.limit ?? null) as number | null,
  };
}
