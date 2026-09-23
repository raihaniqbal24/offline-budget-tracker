/**
 * CSV of entries (FR-9.1), readable by Excel and Google Sheets.
 * RFC 4180 quoting, CRLF line ends, and a UTF-8 byte-order mark so Excel
 * shows Indonesian text correctly.
 */
import type { EntryWithDetails } from "../db/entriesDao";

const BOM = "\uFEFF";

/**
 * Quote a cell when needed. Text that a spreadsheet would run as a formula
 * (starting with =, +, -, @, tab or carriage return) gets a leading
 * apostrophe, so a note like "=HYPERLINK(...)" stays plain text.
 */
export function csvCell(
  value: string | number | null,
  { text = false } = {},
): string {
  if (value === null) return "";
  let s = String(value);
  if (text && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: string[][]): string {
  return BOM + rows.map((r) => r.join(",")).join("\r\n") + "\r\n";
}

export const ENTRY_CSV_HEADER = [
  "date",
  "type",
  "amount",
  "currency",
  "account",
  "category",
  "note",
];

/**
 * One row per entry, oldest first. Amounts are signed the way they affect the
 * balance: expenses negative, income positive, adjustments as recorded.
 */
export function entriesToCsv(
  entries: EntryWithDetails[],
  labelOf: (entry: EntryWithDetails) => string,
): string {
  const sorted = [...entries].sort((a, b) =>
    a.occurredOn === b.occurredOn
      ? a.id - b.id
      : a.occurredOn < b.occurredOn
        ? -1
        : 1,
  );
  const rows = sorted.map((e) => [
    csvCell(e.occurredOn),
    csvCell(e.type),
    csvCell(e.type === "expense" ? -e.amount : e.amount),
    csvCell(e.currencyCode),
    csvCell(e.accountName, { text: true }),
    csvCell(labelOf(e), { text: true }),
    csvCell(e.note, { text: true }),
  ]);
  return toCsv([ENTRY_CSV_HEADER, ...rows]);
}

/** "budget-tracker-backup-2026-09-21.json" */
export function backupFileName(
  kind: "backup" | "entries",
  isoDate: string,
): string {
  return kind === "backup"
    ? `budget-tracker-backup-${isoDate}.json`
    : `budget-tracker-entries-${isoDate}.csv`;
}
