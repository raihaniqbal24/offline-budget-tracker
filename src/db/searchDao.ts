import type { SQLiteDatabase } from "expo-sqlite";
import type { ISODate } from "../lib/dates";
import type { ID } from "../types";
import { listEntriesByIds, type EntryWithDetails } from "./entriesDao";
import { listTransfersByIds, type TransferWithDetails } from "./transfersDao";

/** FR-8.2: record types the search can filter by. */
export type SearchType = "expense" | "income" | "adjustment" | "transfer";

export interface SearchFilters {
  /** FR-8.1: matched anywhere in the note, case-insensitively. */
  text: string;
  /** FR-8.1: an exact amount is min = max. Either bound may be null. */
  minAmount: number | null;
  maxAmount: number | null;
  accountId: ID | null;
  /** Multi-select; transfers have no category, so any category excludes them. */
  categoryIds: ID[];
  /** Empty = all types. */
  types: SearchType[];
  startDate: ISODate | null;
  endDate: ISODate | null;
}

export const EMPTY_FILTERS: SearchFilters = {
  text: "",
  minAmount: null,
  maxAmount: null,
  accountId: null,
  categoryIds: [],
  types: [],
  startDate: null,
  endDate: null,
};

export function hasActiveFilters(f: SearchFilters): boolean {
  return (
    f.text.trim() !== "" ||
    f.minAmount !== null ||
    f.maxAmount !== null ||
    f.accountId !== null ||
    f.categoryIds.length > 0 ||
    f.types.length > 0 ||
    f.startDate !== null ||
    f.endDate !== null
  );
}

type Clause = { sql: string; params: (string | number | null)[] };

function likePattern(text: string): string {
  return `%${text.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** WHERE clauses for entries (alias e) and transfers (alias t); all filters combine (FR-8.2). */
function buildClauses(f: SearchFilters): {
  entries: Clause;
  transfers: Clause;
} {
  const e: string[] = [];
  const ep: (string | number | null)[] = [];
  const t: string[] = [];
  const tp: (string | number | null)[] = [];

  const entryTypes = f.types.filter((x) => x !== "transfer");
  if (f.types.length > 0 && entryTypes.length === 0) e.push("0");
  if (entryTypes.length > 0) {
    e.push(`e.type IN (${entryTypes.map(() => "?").join(", ")})`);
    ep.push(...entryTypes);
  }
  if (f.types.length > 0 && !f.types.includes("transfer")) t.push("0");
  if (f.categoryIds.length > 0) {
    e.push(`e.category_id IN (${f.categoryIds.map(() => "?").join(", ")})`);
    ep.push(...f.categoryIds);
    t.push("0");
  }
  if (f.text.trim() !== "") {
    e.push("e.note LIKE ? ESCAPE '\\'");
    ep.push(likePattern(f.text));
    t.push("t.note LIKE ? ESCAPE '\\'");
    tp.push(likePattern(f.text));
  }
  if (f.minAmount !== null) {
    e.push("ABS(e.amount) >= ?");
    ep.push(f.minAmount);
    t.push("t.amount >= ?");
    tp.push(f.minAmount);
  }
  if (f.maxAmount !== null) {
    e.push("ABS(e.amount) <= ?");
    ep.push(f.maxAmount);
    t.push("t.amount <= ?");
    tp.push(f.maxAmount);
  }
  if (f.accountId !== null) {
    e.push("e.account_id = ?");
    ep.push(f.accountId);
    t.push("(t.from_account_id = ? OR t.to_account_id = ?)");
    tp.push(f.accountId, f.accountId);
  }
  if (f.startDate !== null) {
    e.push("e.occurred_on >= ?");
    ep.push(f.startDate);
    t.push("t.occurred_on >= ?");
    tp.push(f.startDate);
  }
  if (f.endDate !== null) {
    e.push("e.occurred_on <= ?");
    ep.push(f.endDate);
    t.push("t.occurred_on <= ?");
    tp.push(f.endDate);
  }

  const where = (parts: string[]) =>
    parts.length > 0 ? parts.join(" AND ") : "1";
  return {
    entries: { sql: where(e), params: ep },
    transfers: { sql: where(t), params: tp },
  };
}

export type SearchRow =
  | { kind: "entry"; entry: EntryWithDetails }
  | { kind: "transfer"; transfer: TransferWithDetails };

/** FR-8.3: matching entries and transfers together, newest first. */
export async function searchRecords(
  db: SQLiteDatabase,
  filters: SearchFilters,
  page: { limit: number; offset: number },
): Promise<SearchRow[]> {
  const { entries, transfers } = buildClauses(filters);
  const refs = await db.getAllAsync<{ kind: "entry" | "transfer"; id: ID }>(
    `SELECT kind, id FROM (
       SELECT 'entry' AS kind, e.id AS id, e.occurred_on AS occurred_on FROM entries e WHERE ${entries.sql}
       UNION ALL
       SELECT 'transfer', t.id, t.occurred_on FROM transfers t WHERE ${transfers.sql}
     )
     ORDER BY occurred_on DESC, kind, id DESC
     LIMIT ? OFFSET ?`,
    ...entries.params,
    ...transfers.params,
    page.limit,
    page.offset,
  );

  const entryIds = refs.filter((r) => r.kind === "entry").map((r) => r.id);
  const transferIds = refs
    .filter((r) => r.kind === "transfer")
    .map((r) => r.id);
  const [entryRows, transferRows] = await Promise.all([
    listEntriesByIds(db, entryIds),
    listTransfersByIds(db, transferIds),
  ]);
  const entryById = new Map(entryRows.map((e) => [e.id, e]));
  const transferById = new Map(transferRows.map((t) => [t.id, t]));

  return refs.flatMap((r): SearchRow[] => {
    if (r.kind === "entry") {
      const entry = entryById.get(r.id);
      return entry ? [{ kind: "entry", entry }] : [];
    }
    const transfer = transferById.get(r.id);
    return transfer ? [{ kind: "transfer", transfer }] : [];
  });
}

export interface SearchSummary {
  count: number;
  /** Expenses plus unrecorded spending among the matches. */
  spending: number;
  /** Income plus unrecorded income among the matches. */
  income: number;
  transferCount: number;
  transferFees: number;
}

/** FR-8.3: count and totals, with spending and income kept separate (decided). */
export async function summarizeSearch(
  db: SQLiteDatabase,
  filters: SearchFilters,
): Promise<SearchSummary> {
  const { entries, transfers } = buildClauses(filters);
  const [e, t] = await Promise.all([
    db.getFirstAsync<{ n: number; spending: number; income: number }>(
      `SELECT COUNT(*) AS n,
              COALESCE(SUM(CASE WHEN e.type = 'expense' OR (e.type = 'adjustment' AND e.amount < 0) THEN ABS(e.amount) END), 0) AS spending,
              COALESCE(SUM(CASE WHEN e.type = 'income' OR (e.type = 'adjustment' AND e.amount > 0) THEN ABS(e.amount) END), 0) AS income
         FROM entries e WHERE ${entries.sql}`,
      ...entries.params,
    ),
    db.getFirstAsync<{ n: number; fees: number }>(
      `SELECT COUNT(*) AS n, COALESCE(SUM(t.fee), 0) AS fees FROM transfers t WHERE ${transfers.sql}`,
      ...transfers.params,
    ),
  ]);
  const entryCount = e?.n ?? 0;
  const transferCount = t?.n ?? 0;
  return {
    count: entryCount + transferCount,
    spending: e?.spending ?? 0,
    income: e?.income ?? 0,
    transferCount,
    transferFees: t?.fees ?? 0,
  };
}
