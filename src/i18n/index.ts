import i18next from "i18next";
import { initReactI18next } from "react-i18next";

import { readLanguagePreference } from "./preference";
import {
  FALLBACK_LANGUAGE,
  LANGUAGES,
  isLanguageCode,
  languageDefinition,
  type LanguageCode,
  type Namespace,
} from "./languages";
import { resolveLanguage, systemLocales } from "./resolve";

/** Namespace used when a key does not name one. */
export const DEFAULT_NAMESPACE = "common" satisfies Namespace;

const resources = Object.fromEntries(
  LANGUAGES.map((language) => [language.code, language.resources]),
);

/** Mirrors the active language onto the document so styling and AT follow it. */
function applyDocumentLanguage(code: string): void {
  if (typeof document === "undefined") return;
  const language = languageDefinition(
    isLanguageCode(code) ? code : FALLBACK_LANGUAGE,
  );
  document.documentElement.lang = language.code;
  document.documentElement.dir = language.dir;
}

/*
 * Initialised while this module is evaluated, before React renders: the
 * catalogs are bundled, so `initAsync: false` makes the language available
 * synchronously and the first frame is already in the right one.
 */
void i18next.use(initReactI18next).init({
  resources,
  lng: resolveLanguage(readLanguagePreference(), systemLocales()),
  fallbackLng: FALLBACK_LANGUAGE,
  supportedLngs: LANGUAGES.map((language) => language.code),
  ns: Object.keys(LANGUAGES[0].resources),
  defaultNS: DEFAULT_NAMESPACE,
  initAsync: false,
  // React escapes what it renders; escaping here as well would double it.
  interpolation: { escapeValue: false },
  returnNull: false,
});

applyDocumentLanguage(i18next.language);
i18next.on("languageChanged", applyDocumentLanguage);

/** The application's i18next instance, initialised on import. */
export const i18n = i18next;

/** Switches the interface language immediately, without a reload. */
export async function changeLanguage(code: LanguageCode): Promise<void> {
  await i18next.changeLanguage(code);
}

/** The language currently shown, always a registered code. */
export function activeLanguage(): LanguageCode {
  return isLanguageCode(i18next.language)
    ? i18next.language
    : FALLBACK_LANGUAGE;
}
