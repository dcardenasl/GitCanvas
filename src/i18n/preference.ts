import { safeStorage } from "../lib/safeStorage";

import { isLanguagePreference, type LanguagePreference } from "./resolve";

const STORAGE_KEY = "gitcanvas.language.v1";

/** The stored preference, or `system` when none or an unknown one is stored. */
export function readLanguagePreference(): LanguagePreference {
  const stored = safeStorage.get(STORAGE_KEY);
  return isLanguagePreference(stored) ? stored : "system";
}

/** Persists the preference; a failure leaves the choice active for this run. */
export function writeLanguagePreference(preference: LanguagePreference): void {
  safeStorage.set(STORAGE_KEY, preference);
}
