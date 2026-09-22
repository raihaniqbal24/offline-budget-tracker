import type { TFunction } from "i18next";
import type { BudgetTarget } from "../db/budgetsDao";
import { categoryLabel } from "../i18n";
import type { Account, Category } from "../types";

/** Display name for a limit: "Overall", an account name, or a category name. */
export function budgetLabel(
  target: BudgetTarget,
  accounts: Pick<Account, "id" | "name">[],
  categories: Pick<Category, "id" | "name" | "i18nKey">[],
  t: TFunction
): string {
  if (target.scope === "overall") return t("budgets.overall");
  if (target.scope === "account") return accounts.find((a) => a.id === target.accountId)?.name ?? "";
  const category = categories.find((c) => c.id === target.categoryId);
  return category ? categoryLabel(category) : "";
}
