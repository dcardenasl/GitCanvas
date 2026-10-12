// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const STORAGE_KEY = "gitcanvas.language.v1";

/** Loads the i18n module afresh, as the application does once at startup. */
async function startUp() {
  vi.resetModules();
  return import("./index");
}

function systemSpeaks(...locales: string[]) {
  vi.spyOn(navigator, "languages", "get").mockReturnValue(locales);
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("startup language", () => {
  it("is Spanish when the system uses Spanish", async () => {
    systemSpeaks("es-CO");
    const { i18n } = await startUp();

    expect(i18n.language).toBe("es");
    expect(document.documentElement.lang).toBe("es");
  });

  it("is English for any other system language", async () => {
    systemSpeaks("de-DE");
    const { i18n } = await startUp();

    expect(i18n.language).toBe("en");
    expect(document.documentElement.lang).toBe("en");
  });

  it("honours a stored choice over the system", async () => {
    localStorage.setItem(STORAGE_KEY, "en");
    systemSpeaks("es-ES");
    const { i18n } = await startUp();

    expect(i18n.language).toBe("en");
  });

  it("ignores a stored value that is not a registered language", async () => {
    localStorage.setItem(STORAGE_KEY, "klingon");
    systemSpeaks("es-ES");
    const { i18n } = await startUp();

    expect(i18n.language).toBe("es");
  });

  it("has the catalogs ready before the first render", async () => {
    systemSpeaks("es-ES");
    const { i18n } = await startUp();

    expect(i18n.isInitialized).toBe(true);
    expect(i18n.t("shell:toolbar.refresh")).toBe("Actualizar");
  });

  it("falls back to English for a key a language lacks", async () => {
    systemSpeaks("es-ES");
    const { i18n } = await startUp();
    i18n.removeResourceBundle("es", "shell");

    expect(i18n.t("shell:toolbar.refresh")).toBe("Refresh");
  });
});
