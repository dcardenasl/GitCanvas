// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { i18n } from "../i18n";

import { useLanguagePreferences } from "./languagePreferences";

const STORAGE_KEY = "gitcanvas.language.v1";

function systemSpeaks(...locales: string[]) {
  vi.spyOn(navigator, "languages", "get").mockReturnValue(locales);
}

function choose(preference: "system" | "en" | "es") {
  useLanguagePreferences.getState().setPreference(preference);
}

beforeEach(() => {
  localStorage.clear();
  systemSpeaks("en-US");
  choose("es");
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("language preferences", () => {
  it("switches the interface immediately and updates the document", async () => {
    choose("en");

    await vi.waitFor(() => {
      expect(i18n.language).toBe("en");
    });
    expect(useLanguagePreferences.getState().language).toBe("en");
    expect(document.documentElement.lang).toBe("en");
    expect(document.documentElement.dir).toBe("ltr");
    expect(i18n.t("shell:toolbar.refresh")).toBe("Refresh");
  });

  it("remembers an explicit choice", () => {
    choose("en");

    expect(localStorage.getItem(STORAGE_KEY)).toBe("en");
    expect(useLanguagePreferences.getState().preference).toBe("en");
  });

  it("follows the system language while system is selected", async () => {
    systemSpeaks("es-MX", "en-US");
    choose("system");
    await vi.waitFor(() => {
      expect(i18n.language).toBe("es");
    });

    systemSpeaks("fr-FR");
    window.dispatchEvent(new Event("languagechange"));

    await vi.waitFor(() => {
      expect(i18n.language).toBe("en");
    });
    expect(useLanguagePreferences.getState().preference).toBe("system");
  });

  it("ignores system language changes once a language was chosen", async () => {
    choose("es");
    systemSpeaks("en-US");
    window.dispatchEvent(new Event("languagechange"));

    await Promise.resolve();
    expect(i18n.language).toBe("es");
  });

  it("keeps working when storage writes fail", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });

    expect(() => {
      choose("en");
    }).not.toThrow();
    await vi.waitFor(() => {
      expect(i18n.language).toBe("en");
    });
  });
});
