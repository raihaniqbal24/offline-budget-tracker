/**
 * Domain types for the SRS data model. Database rows are snake_case; DAOs map
 * them to these camelCase shapes. Amounts are whole rupiah integers.
 */
import type { Frequency, ISODate, MonthKey } from "../lib/dates";

export type ID = number;
export type CurrencyCode = "IDR";

export type AccountType = "cash" | "bank" | "ewallet" | "other";

export interface Account {
  id: ID;
  name: string;
  type: AccountType;
  openingBalance: number;
  alertLine: number | null;
  currencyCode: CurrencyCode;
  sortOrder: number;
  archived: boolean;
}

/** Account plus its derived balance (never stored). */
export interface AccountWithBalance extends Account {
  balance: number;
  isBelowAlertLine: boolean;
}

export type CategoryType = "expense" | "income";
export type BuiltinCategoryKey = "unrecorded" | "transfer_fees";

export interface Category {
  id: ID;
  name: string;
  type: CategoryType;
  icon: string;
  color: string;
  sortOrder: number;
  archived: boolean;
  builtinKey: BuiltinCategoryKey | null;
  i18nKey: string | null;
}

/** Adjustment amounts are signed: negative = unrecorded spending. */
export type EntryType = "expense" | "income" | "adjustment";

export interface Entry {
  id: ID;
  /** Globally unique across phones and installs; used by backup merge. */
  uid: string;
  type: EntryType;
  amount: number;
  currencyCode: CurrencyCode;
  accountId: ID;
  categoryId: ID;
  occurredOn: ISODate;
  note: string | null;
  recurringRuleId: ID | null;
  createdAt: string;
}

export type FeePaidBy = "sender" | "recipient";

export interface Transfer {
  id: ID;
  /** Globally unique across phones and installs; used by backup merge. */
  uid: string;
  fromAccountId: ID;
  toAccountId: ID;
  amount: number;
  fee: number;
  feePaidBy: FeePaidBy;
  currencyCode: CurrencyCode;
  occurredOn: ISODate;
  note: string | null;
  recurringRuleId: ID | null;
  createdAt: string;
}

export type BudgetScope = "category" | "account" | "overall";

export interface Budget {
  id: ID;
  scope: BudgetScope;
  categoryId: ID | null;
  accountId: ID | null;
  /** null = limit removed from startMonth onward */
  amount: number | null;
  currencyCode: CurrencyCode;
  startMonth: MonthKey;
}

export type BudgetLevel = 75 | 90 | 100;

export type GoalMeasure = "linked" | "manual";

export interface Goal {
  id: ID;
  name: string;
  targetAmount: number;
  currencyCode: CurrencyCode;
  targetDate: ISODate | null;
  measure: GoalMeasure;
  linkedAccountId: ID | null;
  archived: boolean;
}

export type GoalMovementDirection = "contribution" | "release";

export interface GoalMovement {
  id: ID;
  goalId: ID;
  accountId: ID;
  direction: GoalMovementDirection;
  amount: number;
  currencyCode: CurrencyCode;
  occurredOn: ISODate;
  note: string | null;
}

export type RecurringType = "expense" | "income" | "transfer";

export interface RecurringRule {
  id: ID;
  type: RecurringType;
  amount: number;
  currencyCode: CurrencyCode;
  /** from-account for transfers */
  accountId: ID;
  toAccountId: ID | null;
  categoryId: ID | null;
  fee: number;
  feePaidBy: FeePaidBy;
  note: string | null;
  frequency: Frequency;
  startDate: ISODate;
  endDate: ISODate | null;
  archived: boolean;
}

export type PendingStatus = "pending" | "confirmed" | "skipped";

export interface PendingEntry {
  id: ID;
  ruleId: ID;
  dueDate: ISODate;
  status: PendingStatus;
  entryId: ID | null;
  transferId: ID | null;
}

export type LanguageSetting = "system" | "en" | "id";

/** Keys stored in the settings table, with their value types. */
export interface SettingsMap {
  language: LanguageSetting;
  daily_reminder_enabled: boolean;
  daily_reminder_time: string; // "HH:mm"
  backup_reminder_enabled: boolean;
  backup_reminder_weekday: number; // 1 = Monday ... 7 = Sunday
  backup_reminder_time: string; // "HH:mm"
  notification_permission_asked: boolean;
  last_used_account_id: ID | null;
  /** Budget and balance alert notifications (phase 4). */
  alerts_enabled: boolean;
  /** UTC timestamp of the last export, or null. */
  last_backup_at: string | null;
}

export type SettingKey = keyof SettingsMap;
