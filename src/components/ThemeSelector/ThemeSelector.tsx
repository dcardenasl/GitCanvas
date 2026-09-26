import {
  useThemePreferences,
  type ThemePreference,
} from "../../state/themePreferences";

import "./ThemeSelector.css";

const OPTIONS: readonly { value: ThemePreference; label: string }[] = [
  { value: "dark", label: "Oscuro" },
  { value: "light", label: "Claro" },
  { value: "system", label: "Sistema" },
];

/** Compact, keyboard-accessible appearance selector for the application window. */
export function ThemeSelector() {
  const preference = useThemePreferences((state) => state.preference);
  const setPreference = useThemePreferences.getState().setPreference;

  return (
    <label className="theme-selector">
      <span className="theme-selector__label">Tema</span>
      <select
        className="theme-selector__select"
        aria-label="Tema de la aplicación"
        value={preference}
        onChange={(event) => {
          setPreference(event.currentTarget.value as ThemePreference);
        }}
      >
        {OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
