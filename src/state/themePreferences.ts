import { create } from "zustand";

import { safeStorage } from "../lib/safeStorage";

/** User-selected appearance, optionally following the operating system. */
export type ThemePreference = "dark" | "light" | "system";
/** Concrete palette applied to the document after resolving system preference. */
export type ResolvedTheme = Exclude<ThemePreference, "system">;

const STORAGE_KEY = "gitcanvas.theme.v1";

function readPreference(): ThemePreference {
  const stored = safeStorage.get(STORAGE_KEY);
  return stored === "light" || stored === "system" || stored === "dark"
    ? stored
    : "dark";
}

function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference !== "system") return preference;
  return typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

function applyTheme(preference: ThemePreference): ResolvedTheme {
  const theme = resolveTheme(preference);
  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = theme;
  }
  return theme;
}

interface ThemePreferences {
  readonly preference: ThemePreference;
  readonly resolvedTheme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
}

/** Window-level appearance preference, independent of the selected repository. */
/** Appearance preference store, persisted independently of repository state. */
export const useThemePreferences = create<ThemePreferences>((set) => {
  const preference = readPreference();
  // The store is created while the entry module is evaluated, before React
  // renders, so a saved light preference is applied without a dark flash.
  const resolvedTheme = applyTheme(preference);

  return {
    preference,
    resolvedTheme,
    setPreference: (next) => {
      safeStorage.set(STORAGE_KEY, next);
      const nextResolvedTheme = applyTheme(next);
      set({ preference: next, resolvedTheme: nextResolvedTheme });
    },
  };
});

if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
  const systemAppearance = window.matchMedia("(prefers-color-scheme: light)");
  systemAppearance.addEventListener("change", () => {
    const { preference } = useThemePreferences.getState();
    if (preference === "system") {
      const resolvedTheme = applyTheme(preference);
      useThemePreferences.setState({ resolvedTheme });
    }
  });
}
