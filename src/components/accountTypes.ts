import type { AccountType } from "../types";

export const ACCOUNT_TYPES: AccountType[] = [
  "cash",
  "bank",
  "ewallet",
  "other",
];

export const ACCOUNT_TYPE_ICONS: Record<AccountType, string> = {
  cash: "cash",
  bank: "bank-outline",
  ewallet: "cellphone",
  other: "wallet-outline",
};
