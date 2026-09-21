import type { SQLiteDatabase } from "expo-sqlite";

/**
 * Migration 1 — the full SRS data model (Data requirements section).
 *
 * Money:  INTEGER whole rupiah, with currency_code on every money row.
 * Dates:  occurred_on / due dates are local 'YYYY-MM-DD' TEXT;
 *         created_at / updated_at are UTC timestamps, never used for grouping.
 * Balances and totals are never stored; they come from the views below.
 */

const NOW = `(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;
const ISO_DATE = (col: string) =>
  `CHECK (${col} GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]')`;
const ISO_DATE_OR_NULL = (col: string) =>
  `CHECK (${col} IS NULL OR ${col} GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]')`;

export const SCHEMA_V1 = `
-- 1. Accounts (FR-1.1, FR-1.8) -----------------------------------------------
CREATE TABLE accounts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT    NOT NULL CHECK (length(trim(name)) > 0),
  type            TEXT    NOT NULL CHECK (type IN ('cash', 'bank', 'ewallet', 'other')),
  opening_balance INTEGER NOT NULL DEFAULT 0,
  alert_line      INTEGER,                        -- NULL = no balance alert
  currency_code   TEXT    NOT NULL DEFAULT 'IDR',
  sort_order      INTEGER NOT NULL DEFAULT 0,
  archived        INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  created_at      TEXT    NOT NULL DEFAULT ${NOW},
  updated_at      TEXT    NOT NULL DEFAULT ${NOW}
);

-- 2. Categories (FR-6.1 to FR-6.4) ---------------------------------------------
-- builtin_key: 'unrecorded' | 'transfer_fees' | NULL for user categories.
-- i18n_key:    set for seeded categories so they show in the chosen language
--              until the user renames them (rename clears it).
CREATE TABLE categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL CHECK (length(trim(name)) > 0),
  type        TEXT    NOT NULL CHECK (type IN ('expense', 'income')),
  icon        TEXT    NOT NULL,
  color       TEXT    NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  archived    INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  builtin_key TEXT    UNIQUE CHECK (builtin_key IS NULL OR builtin_key IN ('unrecorded', 'transfer_fees')),
  i18n_key    TEXT,
  created_at  TEXT    NOT NULL DEFAULT ${NOW},
  updated_at  TEXT    NOT NULL DEFAULT ${NOW}
);
CREATE UNIQUE INDEX ux_categories_type_name ON categories (type, name COLLATE NOCASE);

-- 3. Recurring rules (FR-11.1). Created before entries/transfers reference it.
-- account_id is the from-account for transfers.
CREATE TABLE recurring_rules (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  type          TEXT    NOT NULL CHECK (type IN ('expense', 'income', 'transfer')),
  amount        INTEGER NOT NULL CHECK (amount > 0),
  currency_code TEXT    NOT NULL DEFAULT 'IDR',
  account_id    INTEGER NOT NULL REFERENCES accounts (id) ON DELETE RESTRICT,
  to_account_id INTEGER REFERENCES accounts (id) ON DELETE RESTRICT,
  category_id   INTEGER REFERENCES categories (id) ON DELETE RESTRICT,
  fee           INTEGER NOT NULL DEFAULT 0 CHECK (fee >= 0),
  fee_paid_by   TEXT    NOT NULL DEFAULT 'sender' CHECK (fee_paid_by IN ('sender', 'recipient')),
  note          TEXT,
  frequency     TEXT    NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly', 'yearly')),
  start_date    TEXT    NOT NULL ${ISO_DATE("start_date")},
  end_date      TEXT    ${ISO_DATE_OR_NULL("end_date")},
  archived      INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  created_at    TEXT    NOT NULL DEFAULT ${NOW},
  updated_at    TEXT    NOT NULL DEFAULT ${NOW},
  CHECK (end_date IS NULL OR end_date >= start_date),
  CHECK (
    (type = 'transfer' AND to_account_id IS NOT NULL AND to_account_id <> account_id AND category_id IS NULL)
    OR (type IN ('expense', 'income') AND category_id IS NOT NULL AND to_account_id IS NULL AND fee = 0)
  )
);

-- 4. Entries: expense, income and adjustment (FR-1.4 to FR-1.7, FR-2, FR-4) --
-- Expense and income amounts are positive. Adjustments carry a sign:
-- negative = unrecorded spending, positive = unrecorded income.
CREATE TABLE entries (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  type              TEXT    NOT NULL CHECK (type IN ('expense', 'income', 'adjustment')),
  amount            INTEGER NOT NULL,
  currency_code     TEXT    NOT NULL DEFAULT 'IDR',
  account_id        INTEGER NOT NULL REFERENCES accounts (id) ON DELETE RESTRICT,
  category_id       INTEGER NOT NULL REFERENCES categories (id) ON DELETE RESTRICT,
  occurred_on       TEXT    NOT NULL ${ISO_DATE("occurred_on")},
  note              TEXT,
  recurring_rule_id INTEGER REFERENCES recurring_rules (id) ON DELETE SET NULL,
  created_at        TEXT    NOT NULL DEFAULT ${NOW},
  updated_at        TEXT    NOT NULL DEFAULT ${NOW},
  CHECK (
    (type IN ('expense', 'income') AND amount > 0)
    OR (type = 'adjustment' AND amount <> 0)
  )
);
CREATE INDEX ix_entries_occurred_on     ON entries (occurred_on);
CREATE INDEX ix_entries_category_id     ON entries (category_id);
CREATE INDEX ix_entries_account_id      ON entries (account_id);
CREATE INDEX ix_entries_account_date    ON entries (account_id, occurred_on);
CREATE INDEX ix_entries_type_date       ON entries (type, occurred_on);

-- 5. Transfers: one record keeps both sides in sync (FR-5) ------------------
CREATE TABLE transfers (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  from_account_id   INTEGER NOT NULL REFERENCES accounts (id) ON DELETE RESTRICT,
  to_account_id     INTEGER NOT NULL REFERENCES accounts (id) ON DELETE RESTRICT,
  amount            INTEGER NOT NULL CHECK (amount > 0),
  fee               INTEGER NOT NULL DEFAULT 0 CHECK (fee >= 0),
  fee_paid_by       TEXT    NOT NULL DEFAULT 'sender' CHECK (fee_paid_by IN ('sender', 'recipient')),
  currency_code     TEXT    NOT NULL DEFAULT 'IDR',
  occurred_on       TEXT    NOT NULL ${ISO_DATE("occurred_on")},
  note              TEXT,
  recurring_rule_id INTEGER REFERENCES recurring_rules (id) ON DELETE SET NULL,
  created_at        TEXT    NOT NULL DEFAULT ${NOW},
  updated_at        TEXT    NOT NULL DEFAULT ${NOW},
  CHECK (from_account_id <> to_account_id),
  CHECK (fee_paid_by = 'sender' OR fee <= amount)
);
CREATE INDEX ix_transfers_occurred_on ON transfers (occurred_on);
CREATE INDEX ix_transfers_from_date   ON transfers (from_account_id, occurred_on);
CREATE INDEX ix_transfers_to_date     ON transfers (to_account_id, occurred_on);

-- 6. Budgets (FR-7.1, FR-7.2) ---------------------------------------------------
-- One row per change. The limit in force for a month is the row with the
-- latest start_month <= that month. amount NULL = limit removed from then on,
-- so removing a limit never rewrites past months.
CREATE TABLE budgets (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  scope         TEXT    NOT NULL CHECK (scope IN ('category', 'account', 'overall')),
  category_id   INTEGER REFERENCES categories (id) ON DELETE RESTRICT,
  account_id    INTEGER REFERENCES accounts (id) ON DELETE RESTRICT,
  amount        INTEGER CHECK (amount IS NULL OR amount > 0),
  currency_code TEXT    NOT NULL DEFAULT 'IDR',
  start_month   TEXT    NOT NULL CHECK (start_month GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]'),
  created_at    TEXT    NOT NULL DEFAULT ${NOW},
  CHECK (
    (scope = 'category' AND category_id IS NOT NULL AND account_id IS NULL)
    OR (scope = 'account' AND account_id IS NOT NULL AND category_id IS NULL)
    OR (scope = 'overall' AND category_id IS NULL AND account_id IS NULL)
  )
);
CREATE UNIQUE INDEX ux_budgets_target_month
  ON budgets (scope, IFNULL(category_id, 0), IFNULL(account_id, 0), start_month);

-- 7. Goals (FR-12.1, FR-12.2) ---------------------------------------------------
CREATE TABLE goals (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  name              TEXT    NOT NULL CHECK (length(trim(name)) > 0),
  target_amount     INTEGER NOT NULL CHECK (target_amount > 0),
  currency_code     TEXT    NOT NULL DEFAULT 'IDR',
  target_date       TEXT    ${ISO_DATE_OR_NULL("target_date")},
  measure           TEXT    NOT NULL CHECK (measure IN ('linked', 'manual')),
  linked_account_id INTEGER REFERENCES accounts (id) ON DELETE RESTRICT,
  archived          INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  created_at        TEXT    NOT NULL DEFAULT ${NOW},
  updated_at        TEXT    NOT NULL DEFAULT ${NOW},
  CHECK (
    (measure = 'linked' AND linked_account_id IS NOT NULL)
    OR (measure = 'manual' AND linked_account_id IS NULL)
  )
);

-- 8. Goal movements: money between an account and a manual goal (FR-12.3, 12.4)
CREATE TABLE goal_movements (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  goal_id       INTEGER NOT NULL REFERENCES goals (id) ON DELETE RESTRICT,
  account_id    INTEGER NOT NULL REFERENCES accounts (id) ON DELETE RESTRICT,
  direction     TEXT    NOT NULL CHECK (direction IN ('contribution', 'release')),
  amount        INTEGER NOT NULL CHECK (amount > 0),
  currency_code TEXT    NOT NULL DEFAULT 'IDR',
  occurred_on   TEXT    NOT NULL ${ISO_DATE("occurred_on")},
  note          TEXT,
  created_at    TEXT    NOT NULL DEFAULT ${NOW}
);
CREATE INDEX ix_goal_movements_goal         ON goal_movements (goal_id);
CREATE INDEX ix_goal_movements_account_date ON goal_movements (account_id, occurred_on);

-- 9. Pending entries from recurring rules (FR-11.2 to FR-11.5) ----------------
-- UNIQUE (rule_id, due_date) guarantees no occurrence is ever added twice.
CREATE TABLE pending_entries (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id     INTEGER NOT NULL REFERENCES recurring_rules (id) ON DELETE CASCADE,
  due_date    TEXT    NOT NULL ${ISO_DATE("due_date")},
  status      TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'skipped')),
  entry_id    INTEGER REFERENCES entries (id) ON DELETE SET NULL,
  transfer_id INTEGER REFERENCES transfers (id) ON DELETE SET NULL,
  created_at  TEXT    NOT NULL DEFAULT ${NOW},
  resolved_at TEXT,
  UNIQUE (rule_id, due_date)
);
CREATE INDEX ix_pending_entries_status ON pending_entries (status, due_date);

-- 10. Settings and alert state (FR-7.5, FR-10.2, FR-10.4) ----------------------
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Highest warning level already notified for a budget row in a month.
CREATE TABLE budget_alert_state (
  budget_id   INTEGER NOT NULL REFERENCES budgets (id) ON DELETE CASCADE,
  month       TEXT    NOT NULL CHECK (month GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]'),
  last_level  INTEGER NOT NULL CHECK (last_level IN (75, 90, 100)),
  notified_at TEXT    NOT NULL DEFAULT ${NOW},
  PRIMARY KEY (budget_id, month)
);

-- Whether each account was at or below its line at the last check.
-- A notification fires only on a change from 0 to 1 (one per crossing).
CREATE TABLE account_alert_state (
  account_id   INTEGER PRIMARY KEY REFERENCES accounts (id) ON DELETE CASCADE,
  is_below     INTEGER NOT NULL DEFAULT 0 CHECK (is_below IN (0, 1)),
  last_balance INTEGER,
  checked_at   TEXT    NOT NULL DEFAULT ${NOW}
);

-- Integrity triggers ----------------------------------------------------------

-- FR-6.4: built-in categories cannot be archived.
CREATE TRIGGER trg_categories_builtin_no_archive
BEFORE UPDATE OF archived ON categories
WHEN OLD.builtin_key IS NOT NULL AND NEW.archived = 1
BEGIN
  SELECT RAISE(ABORT, 'builtin_category_cannot_be_archived');
END;

-- Adjustments always sit on Unrecorded; expense and income use a normal
-- category of the same type. Categorising an adjustment (FR-1.6) is an
-- UPDATE that changes type, sign and category together.
CREATE TRIGGER trg_entries_category_insert
BEFORE INSERT ON entries
BEGIN
  SELECT RAISE(ABORT, 'entry_category_mismatch')
  WHERE NOT EXISTS (
    SELECT 1 FROM categories c
    WHERE c.id = NEW.category_id
      AND (
        (NEW.type = 'adjustment' AND c.builtin_key = 'unrecorded')
        OR (NEW.type <> 'adjustment' AND c.builtin_key IS NULL AND c.type = NEW.type)
      )
  );
END;

CREATE TRIGGER trg_entries_category_update
BEFORE UPDATE OF type, category_id ON entries
BEGIN
  SELECT RAISE(ABORT, 'entry_category_mismatch')
  WHERE NOT EXISTS (
    SELECT 1 FROM categories c
    WHERE c.id = NEW.category_id
      AND (
        (NEW.type = 'adjustment' AND c.builtin_key = 'unrecorded')
        OR (NEW.type <> 'adjustment' AND c.builtin_key IS NULL AND c.type = NEW.type)
      )
  );
END;

-- Contributions and releases only apply to manual goals (FR-12.3).
CREATE TRIGGER trg_goal_movements_manual_only
BEFORE INSERT ON goal_movements
BEGIN
  SELECT RAISE(ABORT, 'goal_movement_requires_manual_goal')
  WHERE NOT EXISTS (SELECT 1 FROM goals g WHERE g.id = NEW.goal_id AND g.measure = 'manual');
END;

-- Views: the one balance calculation (Development Phases, sequencing notes) --

-- Every change to an account balance, signed. Filter with
-- "occurred_on <= :today" (local date from lib/dates today()) for balances.
CREATE VIEW v_account_movements AS
  SELECT account_id, occurred_on, amount * (CASE type WHEN 'expense' THEN -1 ELSE 1 END) AS delta,
         'entry' AS source, id AS source_id
    FROM entries
  UNION ALL
  SELECT from_account_id, occurred_on,
         -(amount + CASE fee_paid_by WHEN 'sender' THEN fee ELSE 0 END),
         'transfer_out', id
    FROM transfers
  UNION ALL
  SELECT to_account_id, occurred_on,
         amount - CASE fee_paid_by WHEN 'recipient' THEN fee ELSE 0 END,
         'transfer_in', id
    FROM transfers
  UNION ALL
  SELECT account_id, occurred_on,
         CASE direction WHEN 'contribution' THEN -amount ELSE amount END,
         'goal_movement', id
    FROM goal_movements;

-- Spending and income for summaries and budgets (FR-3.7, FR-5.5, FR-7.3).
-- Transfers and goal movements are not here: they are neither spending nor
-- income. Transfer fees are spending, charged to whichever account paid them.
CREATE VIEW v_cashflow AS
  SELECT 'entry' AS source, e.id AS source_id, e.type AS entry_type,
         e.account_id, e.category_id, e.occurred_on,
         CASE WHEN e.type = 'expense' OR (e.type = 'adjustment' AND e.amount < 0)
              THEN 'spending' ELSE 'income' END AS flow,
         ABS(e.amount) AS amount
    FROM entries e
  UNION ALL
  SELECT 'transfer_fee', t.id, 'transfer_fee',
         CASE t.fee_paid_by WHEN 'sender' THEN t.from_account_id ELSE t.to_account_id END,
         (SELECT id FROM categories WHERE builtin_key = 'transfer_fees'),
         t.occurred_on, 'spending', t.fee
    FROM transfers t
   WHERE t.fee > 0;
`;

export const SEED_V1 = `
INSERT INTO categories (name, type, icon, color, sort_order, builtin_key, i18n_key) VALUES
  ('Unrecorded',    'expense', 'help-circle-outline', '#7A7F87', 900, 'unrecorded',    'category.builtin.unrecorded'),
  ('Transfer fees', 'expense', 'bank-transfer',       '#5B6B8C', 901, 'transfer_fees', 'category.builtin.transferFees');

INSERT INTO categories (name, type, icon, color, sort_order, i18n_key) VALUES
  ('Food',      'expense', 'silverware-fork-knife', '#D9822B', 1, 'category.starter.food'),
  ('Transport', 'expense', 'bus',                   '#2B7BB9', 2, 'category.starter.transport'),
  ('Bills',     'expense', 'receipt',               '#8E5BB5', 3, 'category.starter.bills'),
  ('Shopping',  'expense', 'cart-outline',          '#C2457A', 4, 'category.starter.shopping'),
  ('Health',    'expense', 'medical-bag',           '#2E9E6B', 5, 'category.starter.health'),
  ('Other',     'expense', 'dots-horizontal',       '#7A7F87', 6, 'category.starter.other'),
  ('Salary',    'income',  'briefcase-outline',     '#1B7F3B', 1, 'category.starter.salary'),
  ('Other',     'income',  'cash',                  '#4F8A5B', 2, 'category.starter.otherIncome');

INSERT INTO settings (key, value) VALUES
  ('language',                'system'),
  ('daily_reminder_enabled',  '0'),
  ('daily_reminder_time',     '20:00'),
  ('backup_reminder_enabled', '0'),
  ('backup_reminder_weekday', '7'),
  ('backup_reminder_time',    '19:00'),
  ('notification_permission_asked', '0');
`;

export async function up(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(SCHEMA_V1);
  await db.execAsync(SEED_V1);
}
