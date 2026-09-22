import { useTranslation } from "react-i18next";
import type { AppLanguage } from "../lib/money";

/** The active language, re-rendering the component when it changes. */
export function useAppLanguage(): AppLanguage {
  const { i18n } = useTranslation();
  return i18n.language === "id" ? "id" : "en";
}
