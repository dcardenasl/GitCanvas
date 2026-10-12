import {
  FALLBACK_LANGUAGE,
  LANGUAGES,
  isLanguageCode,
  type LanguageCode,
} from "./languages";

/** What the user chose: follow the system, or one registered language. */
export type LanguagePreference = "system" | LanguageCode;

/** Whether `value` is a valid stored or selected preference. */
export function isLanguagePreference(
  value: unknown,
): value is LanguagePreference {
  return value === "system" || isLanguageCode(value);
}

/**
 * The first registered language that matches one of the system's locales.
 *
 * Locales arrive in the user's order of preference. A regional tag such as
 * `es-MX` matches its primary language, but an exact match for the full tag is
 * preferred when a region is ever registered on its own.
 */
export function matchSystemLanguage(
  locales: readonly string[],
): LanguageCode | null {
  for (const locale of locales) {
    const tag = locale.trim().toLowerCase();
    if (tag === "") continue;

    const exact = LANGUAGES.find(
      (language) => language.code.toLowerCase() === tag,
    );
    if (exact !== undefined) return exact.code;

    const primary = tag.split("-")[0];
    const partial = LANGUAGES.find(
      (language) => language.code.toLowerCase().split("-")[0] === primary,
    );
    if (partial !== undefined) return partial.code;
  }
  return null;
}

/**
 * The language to show for a preference.
 *
 * An explicit choice wins. `system` follows the system's locales and falls
 * back to the base language when none of them is registered.
 */
export function resolveLanguage(
  preference: LanguagePreference,
  systemLocales: readonly string[],
): LanguageCode {
  if (preference !== "system") return preference;
  return matchSystemLanguage(systemLocales) ?? FALLBACK_LANGUAGE;
}

/** The system's locales in order of preference, empty outside a browser. */
export function systemLocales(): readonly string[] {
  if (typeof navigator === "undefined") return [];
  if (navigator.languages.length > 0) return navigator.languages;
  return navigator.language === "" ? [] : [navigator.language];
}
