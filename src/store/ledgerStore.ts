import { create } from "zustand";
import { getDb } from "../db/client";
import {
  createAccount,
  listAccountsWithBalances,
  setAccountArchived,
  updateAccount,
  type AccountInput,
} from "../db/accountsDao";
import { listCategories } from "../db/categoriesDao";
import {
  createEntry,
  deleteEntry,
  restoreEntry,
  updateEntry,
  type EntryInput,
} from "../db/entriesDao";
import { getSetting, setSetting } from "../db/settingsDao";
import { today } from "../lib/dates";
import type { AccountWithBalance, Category, Entry, ID } from "../types";

/** How long the undo bar stays after a delete (decided: 5 seconds). */
export const UNDO_WINDOW_MS = 5_000;

interface UndoState {
  entry: Entry;
  /** Changes on every delete, so an old timer can't dismiss a newer undo. */
  token: number;
}

interface LedgerState {
  accounts: AccountWithBalance[];
  categories: Category[];
  lastUsedAccountId: ID | null;
  /**
   * Bumped after every write and when the app returns to the foreground.
   * Screens that run their own queries (lists, totals) re-query when it changes.
   */
  dataVersion: number;
  undo: UndoState | null;

  load: () => Promise<void>;
  refresh: () => Promise<void>;
  saveAccount: (input: AccountInput, id?: ID) => Promise<ID>;
  setAccountArchived: (id: ID, archived: boolean) => Promise<void>;
  saveEntry: (input: EntryInput, id?: ID) => Promise<ID>;
  deleteEntry: (id: ID) => Promise<void>;
  undoDelete: () => Promise<void>;
  dismissUndo: (token: number) => void;
}

let undoCounter = 0;

export const useLedgerStore = create<LedgerState>()((set, get) => ({
  accounts: [],
  categories: [],
  lastUsedAccountId: null,
  dataVersion: 0,
  undo: null,

  load: async () => {
    const db = await getDb();
    const [accounts, categories, lastUsedAccountId] = await Promise.all([
      listAccountsWithBalances(db, today()),
      listCategories(db),
      getSetting(db, "last_used_account_id"),
    ]);
    set({ accounts, categories, lastUsedAccountId });
  },

  /** Recalculate balances for today's date and tell screens to re-query. */
  refresh: async () => {
    const db = await getDb();
    const accounts = await listAccountsWithBalances(db, today());
    set((s) => ({ accounts, dataVersion: s.dataVersion + 1 }));
  },

  saveAccount: async (input, id) => {
    const db = await getDb();
    let accountId: ID;
    if (id === undefined) {
      accountId = await createAccount(db, input);
    } else {
      await updateAccount(db, id, input);
      accountId = id;
    }
    await get().refresh();
    return accountId;
  },

  setAccountArchived: async (id, archived) => {
    const db = await getDb();
    await setAccountArchived(db, id, archived);
    await get().refresh();
  },

  saveEntry: async (input, id) => {
    const db = await getDb();
    let entryId: ID;
    if (id === undefined) {
      entryId = await createEntry(db, input);
    } else {
      await updateEntry(db, id, input);
      entryId = id;
    }
    // FR-2.9: the next entry defaults to the account used last.
    await setSetting(db, "last_used_account_id", input.accountId);
    set({ lastUsedAccountId: input.accountId });
    await get().refresh();
    return entryId;
  },

  deleteEntry: async (id) => {
    const db = await getDb();
    const entry = await deleteEntry(db, id);
    if (entry) set({ undo: { entry, token: ++undoCounter } });
    await get().refresh();
  },

  undoDelete: async () => {
    const pending = get().undo;
    if (!pending) return;
    set({ undo: null });
    const db = await getDb();
    await restoreEntry(db, pending.entry);
    await get().refresh();
  },

  dismissUndo: (token) => {
    if (get().undo?.token === token) set({ undo: null });
  },
}));

/*
 * Helpers take plain arrays rather than being store selectors: Zustand 5
 * re-renders forever if a selector returns a new array on every call, so
 * screens read `accounts` from the store and derive these with useMemo.
 */

/** Accounts shown in pickers: not archived, in the user's order. */
export function activeAccounts(
  accounts: AccountWithBalance[],
): AccountWithBalance[] {
  return accounts.filter((a) => !a.archived);
}

/** FR-2.9: last used account if still active, otherwise the first active one. */
export function defaultAccountId(
  accounts: AccountWithBalance[],
  lastUsedAccountId: ID | null,
): ID | null {
  const active = activeAccounts(accounts);
  if (
    lastUsedAccountId !== null &&
    active.some((a) => a.id === lastUsedAccountId)
  ) {
    return lastUsedAccountId;
  }
  return active[0]?.id ?? null;
}
