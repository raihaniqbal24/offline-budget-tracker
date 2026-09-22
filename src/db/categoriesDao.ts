import type { SQLiteDatabase } from "expo-sqlite";
import type { Category, CategoryType, ID } from "../types";
import { mapCategory, SQL_NOW, type CategoryRow } from "./rows";

/** All categories, including archived and built-in ones; screens filter. */
export async function listCategories(db: SQLiteDatabase): Promise<Category[]> {
  const rows = await db.getAllAsync<CategoryRow>(
    "SELECT * FROM categories ORDER BY type, sort_order, id"
  );
  return rows.map(mapCategory);
}

export interface CategoryInput {
  name: string;
  type: CategoryType;
  icon: string;
  color: string;
}

function isUniqueViolation(error: unknown): boolean {
  return /UNIQUE constraint failed/i.test(String((error as Error)?.message ?? error));
}

/** FR-6.1: a new category goes to the end of its type's list. */
export async function createCategory(db: SQLiteDatabase, input: CategoryInput): Promise<ID> {
  const name = input.name.trim();
  if (name.length === 0) throw new Error("name_required");
  try {
    const result = await db.runAsync(
      `INSERT INTO categories (name, type, icon, color, sort_order)
       VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM categories WHERE type = ? AND builtin_key IS NULL))`,
      name,
      input.type,
      input.icon,
      input.color,
      input.type
    );
    return result.lastInsertRowId;
  } catch (error) {
    if (isUniqueViolation(error)) throw new Error("duplicate_name");
    throw error;
  }
}

/**
 * FR-6.2: rename and recolor. The type never changes after creation, because
 * existing entries must keep a category of their own type.
 * `renamed` clears the translation key of a seeded category, so the user's
 * own name shows in both languages from then on.
 */
export async function updateCategory(
  db: SQLiteDatabase,
  id: ID,
  input: Omit<CategoryInput, "type">,
  renamed: boolean
): Promise<void> {
  const name = input.name.trim();
  if (name.length === 0) throw new Error("name_required");
  try {
    await db.runAsync(
      `UPDATE categories
          SET name = ?, icon = ?, color = ?,
              i18n_key = CASE WHEN ? = 1 THEN NULL ELSE i18n_key END,
              updated_at = ${SQL_NOW}
        WHERE id = ? AND builtin_key IS NULL`,
      name,
      input.icon,
      input.color,
      renamed ? 1 : 0,
      id
    );
  } catch (error) {
    if (isUniqueViolation(error)) throw new Error("duplicate_name");
    throw error;
  }
}

/** FR-6.3: categories are archived, never deleted. Built-ins refuse (FR-6.4). */
export async function setCategoryArchived(db: SQLiteDatabase, id: ID, archived: boolean): Promise<void> {
  await db.runAsync(
    `UPDATE categories SET archived = ?, updated_at = ${SQL_NOW} WHERE id = ?`,
    archived ? 1 : 0,
    id
  );
}

/**
 * FR-6.2: move a category one place up or down within its type.
 * Renumbers the whole list in one transaction so ties can't build up.
 */
export async function moveCategory(db: SQLiteDatabase, id: ID, direction: -1 | 1): Promise<void> {
  const target = await db.getFirstAsync<{ type: CategoryType }>(
    "SELECT type FROM categories WHERE id = ? AND builtin_key IS NULL",
    id
  );
  if (!target) return;
  const rows = await db.getAllAsync<{ id: ID }>(
    "SELECT id FROM categories WHERE type = ? AND builtin_key IS NULL ORDER BY sort_order, id",
    target.type
  );
  const ids = rows.map((r) => r.id);
  const from = ids.indexOf(id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= ids.length) return;
  [ids[from], ids[to]] = [ids[to], ids[from]];

  await db.withTransactionAsync(async () => {
    for (let i = 0; i < ids.length; i++) {
      await db.runAsync("UPDATE categories SET sort_order = ? WHERE id = ?", i + 1, ids[i]);
    }
  });
}
