/**
 * Money utilities (SRS FR-2.1, FR-2.4, FR-2.5, FR-2.6, NFR-11).
 *
 * All amounts are whole rupiah stored as integers. Nothing here uses
 * floating-point arithmetic, so 1.15jt is exactly 1,150,000.
 */

export type AppLanguage = "en" | "id";

export const DEFAULT_CURRENCY = "IDR";

const MULTIPLIERS: Record<string, number> = {
  k: 1_000,
  rb: 1_000,
  m: 1_000_000,
  jt: 1_000_000,
};

// number part, then an optional shorthand suffix
const SHORTHAND_RE = /^(\d+(?:[.,]\d+)?)(k|rb|m|jt)$/;
const PLAIN_RE = /^\d+$/;

/**
 * Parse what the user typed into a whole-rupiah integer.
 *
 * - "50k", "50rb"      -> 50,000
 * - "2m", "2jt"        -> 2,000,000
 * - "1.5jt", "1,5jt"   -> 1,500,000 (dot or comma beside a letter is a decimal)
 * - "50.000", "50,000" -> 50,000    (otherwise it is a thousands separator)
 * - "Rp 25.000"        -> 25,000
 *
 * Returns null when the text is not a valid amount, including:
 * - thousands groups that are not exactly three digits ("1.5", "12.34")
 * - mixed separators ("1.234,567")
 * - shorthand that does not land on a whole rupiah ("1.2345k")
 * - values beyond Number.MAX_SAFE_INTEGER
 *
 * Zero is returned as 0; callers decide whether zero is allowed
 * (entries require amount > 0, fees allow 0).
 */
export function parseAmount(input: string): number | null {
  if (typeof input !== "string") return null;

  let text = input.trim().toLowerCase().replace(/\s+/g, "");
  if (text.startsWith("rp")) text = text.slice(2);
  if (text.length === 0) return null;

  const shorthand = SHORTHAND_RE.exec(text);
  if (shorthand) {
    const [, numberPart, suffix] = shorthand;
    return applyMultiplier(numberPart, MULTIPLIERS[suffix]);
  }

  if (PLAIN_RE.test(text)) return toSafeInt(text);

  return parseGrouped(text);
}

function applyMultiplier(
  numberPart: string,
  multiplier: number,
): number | null {
  const [intPart, fracPart = ""] = numberPart.split(/[.,]/);
  const scale = 10 ** fracPart.length;
  const scaled = BigInt(intPart + fracPart) * BigInt(multiplier);
  if (scaled % BigInt(scale) !== BigInt(0)) return null; // not a whole rupiah
  const value = scaled / BigInt(scale);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(value);
}

function parseGrouped(text: string): number | null {
  const hasDot = text.includes(".");
  const hasComma = text.includes(",");
  if (hasDot && hasComma) return null;

  const sep = hasDot ? "." : ",";
  const groups = text.split(sep);
  if (groups.some((g) => !PLAIN_RE.test(g))) return null;
  if (groups[0].length < 1 || groups[0].length > 3) return null;
  if (groups.slice(1).some((g) => g.length !== 3)) return null;

  return toSafeInt(groups.join(""));
}

function toSafeInt(digits: string): number | null {
  const value = BigInt(digits);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(value);
}

/** Thousands separator for each language (NFR-11). */
export function groupSeparator(lang: AppLanguage): string {
  return lang === "id" ? "." : ",";
}

/** Group digits: 1500000 -> "1.500.000" (id) or "1,500,000" (en). */
export function formatNumber(value: number, lang: AppLanguage): string {
  const negative = value < 0;
  const digits = Math.abs(Math.trunc(value)).toString();
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, groupSeparator(lang));
  return negative ? `-${grouped}` : grouped;
}

/** Display an amount as rupiah: "Rp 1.500.000", "-Rp 50,000". */
export function formatRupiah(value: number, lang: AppLanguage): string {
  const body = `Rp ${formatNumber(Math.abs(value), lang)}`;
  return value < 0 ? `-${body}` : body;
}

/** Signed display for lists: "+Rp 50.000" / "-Rp 50.000". */
export function formatSignedRupiah(value: number, lang: AppLanguage): string {
  if (value === 0) return formatRupiah(0, lang);
  return value > 0
    ? `+${formatRupiah(value, lang)}`
    : formatRupiah(value, lang);
}

/**
 * Live formatting for the amount field (FR-2.6).
 *
 * Inserts thousands separators as the user types plain digits, but never
 * rewrites text that could be shorthand in progress. It leaves the text
 * unchanged when:
 * - it contains a letter ("50k", "1,5j")
 * - it contains the other separator (a decimal, e.g. "1,5" in Indonesian)
 * - its last group is shorter than 3 digits ("1.5" could become "1.5jt")
 *
 * This means the field can briefly show an invalid plain amount such as
 * "15.00" after a deletion; parseAmount then rejects it on save rather than
 * silently storing the wrong number.
 */
export function formatAmountInput(text: string, lang: AppLanguage): string {
  if (/[a-z]/i.test(text)) return text;

  const group = groupSeparator(lang);
  const other = group === "." ? "," : ".";
  if (text.includes(other)) return text;

  const cleaned = text.replace(/\s+/g, "");
  if (!/^[\d.,]*$/.test(cleaned)) return text;

  if (cleaned.includes(group)) {
    const lastGroup = cleaned.slice(cleaned.lastIndexOf(group) + 1);
    if (lastGroup.length < 3) return text;
  }

  const digits = cleaned
    .split(group)
    .join("")
    .replace(/^0+(?=\d)/, "");
  if (digits.length === 0) return "";
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, group);
}

/** True when the value can be stored as an entry or transfer amount. */
export function isValidEntryAmount(value: number | null): value is number {
  return value !== null && Number.isSafeInteger(value) && value > 0;
}
