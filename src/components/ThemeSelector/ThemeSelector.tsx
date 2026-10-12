import { useTranslation } from "react-i18next";

import {
  useThemePreferences,
  type ThemePreference,
} from "../../state/themePreferences";

import "./ThemeSelector.css";

const OPTIONS: readonly ThemePreference[] = ["dark", "light", "system"];

/** Compact, keyboard-accessible appearance selector for the application window. */
export function ThemeSelector() {
  const { t } = useTranslation("shell");
  const preference = useThemePreferences((state) => state.preference);
  const setPreference = useThemePreferences.getState().setPreference;

  return (
    <label className="theme-selector">
      <span className="theme-selector__label">{t("theme.label")}</span>
      <select
        className="theme-selector__select"
        aria-label={t("theme.aria")}
        value={preference}
        onChange={(event) => {
          setPreference(event.currentTarget.value as ThemePreference);
        }}
      >
        {OPTIONS.map((option) => (
          <option key={option} value={option}>
            {t(`theme.${option}`)}
          </option>
        ))}
      </select>
    </label>
  );
}
