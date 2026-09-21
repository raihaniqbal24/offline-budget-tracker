import { create } from "zustand";
import { getDb } from "../db/client";
import { setSetting } from "../db/settingsDao";
import { applyLanguage } from "../i18n";
import type { LanguageSetting } from "../types";

interface SettingsState {
  language: LanguageSetting;
  schemaVersion: number;
  hydrate: (values: {
    language: LanguageSetting;
    schemaVersion: number;
  }) => void;
  setLanguage: (language: LanguageSetting) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>()((set) => ({
  language: "system",
  schemaVersion: 0,

  hydrate: (values) => set(values),

  setLanguage: async (language) => {
    const db = await getDb();
    await setSetting(db, "language", language);
    await applyLanguage(language);
    set({ language });
  },
}));
