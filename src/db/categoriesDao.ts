import type { SQLiteDatabase } from "expo-sqlite";
import type { Category } from "../types";
import { mapCategory, type CategoryRow } from "./rows";

/** All categories, including archived and built-in ones; screens filter. */
export async function listCategories(db: SQLiteDatabase): Promise<Category[]> {
  const rows = await db.getAllAsync<CategoryRow>(
    "SELECT * FROM categories ORDER BY type, sort_order, id",
  );
  return rows.map(mapCategory);
}
