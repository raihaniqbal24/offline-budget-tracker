/**
 * Human-readable date labels in English and Indonesian.
 * Uses fixed name tables instead of Intl so output is identical on every
 * phone and in tests.
 */
import type { AppLanguage } from "./money";
import { addDays, type ISODate } from "./dates";

function parts(value: ISODate): [number, number, number] {
  const [y, m, d] = value.split("-").map(Number);
  return [y, m, d];
}

interface DateNames {
  monthsShort: string[];
  monthsLong: string[];
  weekdaysShort: string[]; // Monday first
  today: string;
  yesterday: string;
  tomorrow: string;
}

const NAMES: Record<AppLanguage, DateNames> = {
  en: {
    monthsShort: [
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
    monthsLong: [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ],
    weekdaysShort: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    today: "Today",
    yesterday: "Yesterday",
    tomorrow: "Tomorrow",
  },
  id: {
    monthsShort: [
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
    monthsLong: [
      "Januari",
      "Februari",
      "Maret",
      "April",
      "Mei",
      "Juni",
      "Juli",
      "Agustus",
      "September",
      "Oktober",
      "November",
      "Desember",
    ],
    weekdaysShort: ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"],
    today: "Hari ini",
    yesterday: "Kemarin",
    tomorrow: "Besok",
  },
};

function weekdayIndex(value: ISODate): number {
  const [y, m, d] = parts(value);
  const day = new Date(y, m - 1, d).getDay(); // 0 = Sunday
  return day === 0 ? 6 : day - 1;
}

/**
 * "21 Sep" in the current year, "21 Sep 2025" otherwise.
 * With weekday: "Mon, 21 Sep".
 */
export function formatDate(
  value: ISODate,
  lang: AppLanguage,
  options: { todayDate: ISODate; weekday?: boolean },
): string {
  const [y, m, d] = parts(value);
  const names = NAMES[lang];
  const sameYear = value.slice(0, 4) === options.todayDate.slice(0, 4);
  const base = `${d} ${names.monthsShort[m - 1]}${sameYear ? "" : ` ${y}`}`;
  return options.weekday
    ? `${names.weekdaysShort[weekdayIndex(value)]}, ${base}`
    : base;
}

/** List headers: "Today", "Yesterday", "Tomorrow", otherwise "Mon, 21 Sep". */
export function formatDayHeader(
  value: ISODate,
  todayDate: ISODate,
  lang: AppLanguage,
): string {
  const names = NAMES[lang];
  if (value === todayDate) return names.today;
  if (value === addDays(todayDate, -1)) return names.yesterday;
  if (value === addDays(todayDate, 1)) return names.tomorrow;
  return formatDate(value, lang, { todayDate, weekday: true });
}

/** "September 2026" */
export function formatMonthYear(value: ISODate, lang: AppLanguage): string {
  const [y, m] = parts(value);
  return `${NAMES[lang].monthsLong[m - 1]} ${y}`;
}
