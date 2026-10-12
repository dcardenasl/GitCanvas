import { create } from "zustand";

import { activeLanguage, changeLanguage } from "../i18n";
import type { LanguageCode } from "../i18n/languages";
import {
  readLanguagePreference,
  writeLanguagePreference,
} from "../i18n/preference";
import {
  resolveLanguage,
  systemLocales,
  type LanguagePreference,
} from "../i18n/resolve";

interface LanguagePreferences {
  /** What the user chose, possibly `system`. */
  readonly preference: LanguagePreference;
  /** The registered language actually shown. */
  readonly language: LanguageCode;
  setPreference: (preference: LanguagePreference) => void;
}

/** Window-level language preference, independent of the selected repository. */
export const useLanguagePreferences = create<LanguagePreferences>((set) => ({
  // The i18n module has already resolved the stored preference before React
  // renders, so the store only mirrors it instead of resolving a second time.
  preference: readLanguagePreference(),
  language: activeLanguage(),
  setPreference: (preference) => {
    writeLanguagePreference(preference);
    const language = resolveLanguage(preference, systemLocales());
    set({ preference, language });
    void changeLanguage(language);
  },
}));

if (typeof window !== "undefined") {
  // With `system` selected, a change of the system's language is followed live.
  window.addEventListener("languagechange", () => {
    const { preference } = useLanguagePreferences.getState();
    if (preference !== "system") return;
    const language = resolveLanguage(preference, systemLocales());
    useLanguagePreferences.setState({ language });
    void changeLanguage(language);
  });
}
