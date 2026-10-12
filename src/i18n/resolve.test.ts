import { describe, expect, it } from "vitest";

import {
  isLanguagePreference,
  matchSystemLanguage,
  resolveLanguage,
} from "./resolve";

describe("matchSystemLanguage", () => {
  it("matches a regional tag to its primary language", () => {
    expect(matchSystemLanguage(["es-MX"])).toBe("es");
    expect(matchSystemLanguage(["en-GB"])).toBe("en");
  });

  it("is case-insensitive and ignores blanks", () => {
    expect(matchSystemLanguage(["", "  ", "ES-ar"])).toBe("es");
  });

  it("follows the order of the system's preferences", () => {
    expect(matchSystemLanguage(["fr-FR", "es-ES", "en-US"])).toBe("es");
    expect(matchSystemLanguage(["en-US", "es-ES"])).toBe("en");
  });

  it("returns null when no locale is registered", () => {
    expect(matchSystemLanguage(["fr-FR", "ja"])).toBeNull();
    expect(matchSystemLanguage([])).toBeNull();
  });
});

describe("resolveLanguage", () => {
  it("starts in Spanish when the system uses Spanish", () => {
    expect(resolveLanguage("system", ["es-CL"])).toBe("es");
  });

  it("falls back to English for any other system language", () => {
    expect(resolveLanguage("system", ["fr-FR"])).toBe("en");
    expect(resolveLanguage("system", [])).toBe("en");
  });

  it("lets an explicit choice win over the system", () => {
    expect(resolveLanguage("en", ["es-ES"])).toBe("en");
    expect(resolveLanguage("es", ["en-US"])).toBe("es");
  });
});

describe("isLanguagePreference", () => {
  it("accepts system and registered codes only", () => {
    expect(isLanguagePreference("system")).toBe(true);
    expect(isLanguagePreference("es")).toBe(true);
    expect(isLanguagePreference("fr")).toBe(false);
    expect(isLanguagePreference(null)).toBe(false);
  });
});
