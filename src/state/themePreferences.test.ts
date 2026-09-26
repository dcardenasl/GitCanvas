// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let systemPrefersLight = false;
const listeners: ((event: MediaQueryListEvent) => void)[] = [];
const mediaQuery = {
  get matches() {
    return systemPrefersLight;
  },
  media: "(prefers-color-scheme: light)",
  onchange: null,
  addEventListener: (
    _type: string,
    listener: (event: MediaQueryListEvent) => void,
  ) => {
    listeners.push(listener);
  },
  removeEventListener: vi.fn(),
  addListener: vi.fn(),
  removeListener: vi.fn(),
  dispatchEvent: vi.fn(() => true),
};

Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: vi.fn(() => mediaQuery as unknown as MediaQueryList),
});

const { useThemePreferences } = await import("./themePreferences");

function choose(preference: "dark" | "light" | "system") {
  useThemePreferences.getState().setPreference(preference);
}

beforeEach(() => {
  localStorage.clear();
  systemPrefersLight = false;
  choose("dark");
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("theme preferences", () => {
  it("defaults to dark and applies it to the document root", () => {
    expect(useThemePreferences.getState().preference).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("applies and remembers a manual light selection", () => {
    choose("light");

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem("gitcanvas.theme.v1")).toBe("light");
  });

  it("follows system changes only while system mode is selected", () => {
    choose("system");
    expect(document.documentElement.dataset.theme).toBe("dark");

    systemPrefersLight = true;
    for (const listener of listeners) {
      listener({ matches: true } as MediaQueryListEvent);
    }
    expect(document.documentElement.dataset.theme).toBe("light");

    choose("dark");
    systemPrefersLight = false;
    for (const listener of listeners) {
      listener({ matches: false } as MediaQueryListEvent);
    }
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("continues to apply a preference when storage writes fail", () => {
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("storage unavailable");
      });

    expect(() => {
      choose("light");
    }).not.toThrow();
    expect(document.documentElement.dataset.theme).toBe("light");

    setItem.mockRestore();
  });
});
