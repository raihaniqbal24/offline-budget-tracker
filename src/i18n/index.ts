import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { getLocales } from "expo-localization";
import en from "./en.json";
import id from "./id.json";
import type { AppLanguage } from "../lib/money";
import type { Category, LanguageSetting } from "../types";

export const resources = {
  en: { translation: en },
  id: { translation: id },
} as const;

/** "system" follows the phone: Indonesian phones get Indonesian, others English. */
export function resolveLanguage(setting: LanguageSetting): AppLanguage {
  if (setting === "en" || setting === "id") return setting;
  return getLocales()[0]?.languageCode === "id" ? "id" : "en";
}

export async function initI18n(setting: LanguageSetting): Promise<void> {
  await i18n.use(initReactI18next).init({
    resources,
    lng: resolveLanguage(setting),
    fallbackLng: "en",
    interpolation: { escapeValue: false },
  });
}

/** Switch language at runtime; no reinstall or restart needed (NFR-10). */
export async function applyLanguage(setting: LanguageSetting): Promise<void> {
  await i18n.changeLanguage(resolveLanguage(setting));
}

/** The language used for number formatting (NFR-11). */
export function currentLanguage(): AppLanguage {
  return i18n.language === "id" ? "id" : "en";
}

/** Seeded categories show in the chosen language until the user renames them. */
export function categoryLabel(
  category: Pick<Category, "name" | "i18nKey">,
): string {
  return category.i18nKey ? i18n.t(category.i18nKey) : category.name;
}

export default i18n;
