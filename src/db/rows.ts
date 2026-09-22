/**
 * Raw row shapes returned by SQLite and their mappers to domain types.
 * SQLite returns INTEGER booleans as 0/1 and NULL as null.
 */
import type {
  Account,
  AccountType,
  BuiltinCategoryKey,
  Category,
  CategoryType,
  CurrencyCode,
  Entry,
  EntryType,
  ID,
} from "../types";

export interface AccountRow {
  id: ID;
  name: string;
  type: AccountType;
  opening_balance: number;
  alert_line: number | null;
  currency_code: CurrencyCode;
  sort_order: number;
  archived: number;
}

export interface CategoryRow {
  id: ID;
  name: string;
  type: CategoryType;
  icon: string;
  color: string;
  sort_order: number;
  archived: number;
  builtin_key: BuiltinCategoryKey | null;
  i18n_key: string | null;
}

export interface EntryRow {
  id: ID;
  type: EntryType;
  amount: number;
  currency_code: CurrencyCode;
  account_id: ID;
  category_id: ID;
  occurred_on: string;
  note: string | null;
  recurring_rule_id: ID | null;
  created_at: string;
}

export function mapAccount(row: AccountRow): Account {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    openingBalance: row.opening_balance,
    alertLine: row.alert_line,
    currencyCode: row.currency_code,
    sortOrder: row.sort_order,
    archived: row.archived === 1,
  };
}

export function mapCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    icon: row.icon,
    color: row.color,
    sortOrder: row.sort_order,
    archived: row.archived === 1,
    builtinKey: row.builtin_key,
    i18nKey: row.i18n_key,
  };
}

export function mapEntry(row: EntryRow): Entry {
  return {
    id: row.id,
    type: row.type,
    amount: row.amount,
    currencyCode: row.currency_code,
    accountId: row.account_id,
    categoryId: row.category_id,
    occurredOn: row.occurred_on,
    note: row.note,
    recurringRuleId: row.recurring_rule_id,
    createdAt: row.created_at,
  };
}

/** SQL fragment for the current UTC timestamp, matching the schema defaults. */
export const SQL_NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";
