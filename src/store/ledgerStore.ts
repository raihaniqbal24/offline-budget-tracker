import { create } from "zustand";
import { getDb } from "../db/client";
import {
  createAccount,
  listAccountsWithBalances,
  setAccountArchived,
  updateAccount,
  type AccountInput,
} from "../db/accountsDao";
import {
  createCategory,
  listCategories,
  moveCategory,
  setCategoryArchived,
  updateCategory,
  type CategoryInput,
} from "../db/categoriesDao";
import { checkBudgetAlerts, setBudgetLimit, type BudgetAlert, type BudgetTarget } from "../db/budgetsDao";
import {
  createEntry,
  deleteEntry,
  restoreEntry,
  updateEntry,
  type EntryInput,
} from "../db/entriesDao";
import { getSetting, setSetting } from "../db/settingsDao";
import {
  createTransfer,
  deleteTransfer,
  restoreTransfer,
  updateTransfer,
  type TransferInput,
} from "../db/transfersDao";
import {
  categorizeAdjustment,
  reconcileAccount,
  splitAdjustment,
  type SplitPart,
} from "../db/adjustmentsDao";
import { monthKey, today, type ISODate } from "../lib/dates";
import type { AccountWithBalance, Category, Entry, ID, Transfer } from "../types";

/** How long the undo bar stays after a delete (decided: 5 seconds). */
export const UNDO_WINDOW_MS = 5_000;

type UndoState =
  | { kind: "entry"; entry: Entry; token: number }
  | { kind: "transfer"; transfer: Transfer; token: number };
// token changes on every delete, so an old timer can't dismiss a newer undo.

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
  /** Budget levels newly reached, shown one at a time after a save (FR-7.5). */
  budgetAlerts: BudgetAlert[];

  load: () => Promise<void>;
  refresh: () => Promise<void>;
  saveAccount: (input: AccountInput, id?: ID) => Promise<ID>;
  setAccountArchived: (id: ID, archived: boolean) => Promise<void>;
  saveEntry: (input: EntryInput, id?: ID) => Promise<ID>;
  deleteEntry: (id: ID) => Promise<void>;
  saveTransfer: (input: TransferInput, id?: ID) => Promise<ID>;
  deleteTransfer: (id: ID) => Promise<void>;
  /** Returns the new adjustment's id, or null when the balance already matched. */
  reconcile: (accountId: ID, realBalance: number, onDate: ISODate) => Promise<ID | null>;
  categorizeAdjustment: (id: ID, categoryId: ID, note: string | null) => Promise<void>;
  /** Returns the signed amount still unrecorded (0 when fully explained). */
  splitAdjustment: (id: ID, parts: SplitPart[]) => Promise<number>;
  saveCategory: (input: CategoryInput, id?: ID, renamed?: boolean) => Promise<ID>;
  setCategoryArchived: (id: ID, archived: boolean) => Promise<void>;
  moveCategory: (id: ID, direction: -1 | 1) => Promise<void>;
  /** Set (or remove, with null) a limit from the current month onward. */
  setBudget: (target: BudgetTarget, amount: number | null) => Promise<void>;
  undoDelete: () => Promise<void>;
  dismissUndo: (token: number) => void;
  dismissBudgetAlert: () => void;
}

let undoCounter = 0;

export const useLedgerStore = create<LedgerState>()((set, get) => ({
  accounts: [],
  categories: [],
  lastUsedAccountId: null,
  dataVersion: 0,
  undo: null,
  budgetAlerts: [],

  load: async () => {
    const db = await getDb();
    const [accounts, categories, lastUsedAccountId] = await Promise.all([
      listAccountsWithBalances(db, today()),
      listCategories(db),
      getSetting(db, "last_used_account_id"),
    ]);
    // FR-7.6: budget warnings are checked whenever the app opens.
    const alerts = await checkBudgetAlerts(db, today());
    set((s) => ({ accounts, categories, lastUsedAccountId, budgetAlerts: [...s.budgetAlerts, ...alerts] }));
  },

  /**
   * Recalculate balances for today's date, check budget warnings, and tell
   * screens to re-query. Runs after every write and when the app returns to
   * the foreground, so warnings are checked on save and on open (FR-7.6).
   */
  refresh: async () => {
    const db = await getDb();
    const accounts = await listAccountsWithBalances(db, today());
    const alerts = await checkBudgetAlerts(db, today());
    set((s) => ({
      accounts,
      dataVersion: s.dataVersion + 1,
      budgetAlerts: alerts.length > 0 ? [...s.budgetAlerts, ...alerts] : s.budgetAlerts,
    }));
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
    if (entry) set({ undo: { kind: "entry", entry, token: ++undoCounter } });
    await get().refresh();
  },

  saveTransfer: async (input, id) => {
    const db = await getDb();
    let transferId: ID;
    if (id === undefined) {
      transferId = await createTransfer(db, input);
    } else {
      await updateTransfer(db, id, input);
      transferId = id;
    }
    await get().refresh();
    return transferId;
  },

  deleteTransfer: async (id) => {
    const db = await getDb();
    const transfer = await deleteTransfer(db, id);
    if (transfer) set({ undo: { kind: "transfer", transfer, token: ++undoCounter } });
    await get().refresh();
  },

  reconcile: async (accountId, realBalance, onDate) => {
    const db = await getDb();
    const id = await reconcileAccount(db, accountId, realBalance, onDate, today());
    await get().refresh();
    return id;
  },

  categorizeAdjustment: async (id, categoryId, note) => {
    const db = await getDb();
    await categorizeAdjustment(db, id, categoryId, note);
    await get().refresh();
  },

  splitAdjustment: async (id, parts) => {
    const db = await getDb();
    const remaining = await splitAdjustment(db, id, parts);
    await get().refresh();
    return remaining;
  },

  saveCategory: async (input, id, renamed = false) => {
    const db = await getDb();
    let categoryId: ID;
    if (id === undefined) {
      categoryId = await createCategory(db, input);
    } else {
      await updateCategory(db, id, input, renamed);
      categoryId = id;
    }
    set({ categories: await listCategories(db) });
    await get().refresh();
    return categoryId;
  },

  setCategoryArchived: async (id, archived) => {
    const db = await getDb();
    await setCategoryArchived(db, id, archived);
    set({ categories: await listCategories(db) });
    await get().refresh();
  },

  moveCategory: async (id, direction) => {
    const db = await getDb();
    await moveCategory(db, id, direction);
    set({ categories: await listCategories(db) });
  },

  setBudget: async (target, amount) => {
    const db = await getDb();
    await setBudgetLimit(db, target, amount, monthKey(today()));
    await get().refresh();
  },

  undoDelete: async () => {
    const pending = get().undo;
    if (!pending) return;
    set({ undo: null });
    const db = await getDb();
    if (pending.kind === "entry") await restoreEntry(db, pending.entry);
    else await restoreTransfer(db, pending.transfer);
    await get().refresh();
  },

  dismissUndo: (token) => {
    if (get().undo?.token === token) set({ undo: null });
  },

  dismissBudgetAlert: () => set((s) => ({ budgetAlerts: s.budgetAlerts.slice(1) })),
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
