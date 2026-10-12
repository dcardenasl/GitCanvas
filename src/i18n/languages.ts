import { en } from "./locales/en";
import { es } from "./locales/es";

/** Text direction of a script, as the `dir` attribute spells it. */
export type TextDirection = "ltr" | "rtl";

/**
 * The catalogs of the base language.
 *
 * Every other language is checked against this shape: the namespaces and keys
 * of `en` are the contract, and the type-level key checks come from it.
 */
export type BaseCatalogs = typeof en;

/** Namespaces the interface is split into, one per feature area. */
export type Namespace = keyof BaseCatalogs;

/** One language the interface can be shown in. */
export interface LanguageDefinition {
  /** BCP 47 tag, also the code the catalog is registered under. */
  readonly code: string;
  /** The language's name in itself, so it is recognisable whatever is active. */
  readonly nativeName: string;
  readonly dir: TextDirection;
  /** Local catalogs; no network or filesystem access is involved. */
  readonly resources: BaseCatalogs;
}

/**
 * The single registry of languages.
 *
 * Adding a language is one folder of catalogs under `locales/` and one entry
 * here; no component, store or selector names a language. English comes first
 * because it is the base catalog and the fallback for everything else.
 */
export const LANGUAGES = [
  { code: "en", nativeName: "English", dir: "ltr", resources: en },
  { code: "es", nativeName: "Español", dir: "ltr", resources: es },
] as const satisfies readonly LanguageDefinition[];

/** Code of a registered language. */
export type LanguageCode = (typeof LANGUAGES)[number]["code"];

/** Code of the base language: the catalog of record and the fallback. */
export const FALLBACK_LANGUAGE: LanguageCode = "en";

/** Whether `value` is the code of a registered language. */
export function isLanguageCode(value: unknown): value is LanguageCode {
  return LANGUAGES.some((language) => language.code === value);
}

/** The registry entry for a registered language code. */
export function languageDefinition(code: LanguageCode): LanguageDefinition {
  const found = LANGUAGES.find((language) => language.code === code);
  // The type makes a miss impossible; the base language keeps this total
  // without a throw for a value the compiler already ruled out.
  return found ?? LANGUAGES[0];
}
