import { useTranslation } from "react-i18next";

import { LANGUAGES } from "../../i18n/languages";
import { isLanguagePreference } from "../../i18n/resolve";
import { useLanguagePreferences } from "../../state/languagePreferences";

import "./LanguageSelector.css";

/**
 * Compact, keyboard-accessible language selector.
 *
 * Options come from the language registry, so a new language appears here
 * without touching this component. Each is named in its own language and marked
 * with it, so it reads correctly whichever language is active.
 */
export function LanguageSelector() {
  const { t } = useTranslation("shell");
  const preference = useLanguagePreferences((state) => state.preference);
  const setPreference = useLanguagePreferences.getState().setPreference;

  return (
    <label className="language-selector">
      <span className="language-selector__label">{t("language.label")}</span>
      <select
        className="language-selector__select"
        aria-label={t("language.aria")}
        value={preference}
        onChange={(event) => {
          const next = event.currentTarget.value;
          if (isLanguagePreference(next)) setPreference(next);
        }}
      >
        <option value="system">{t("language.system")}</option>
        {LANGUAGES.map((language) => (
          <option
            key={language.code}
            value={language.code}
            lang={language.code}
            dir={language.dir}
          >
            {language.nativeName}
          </option>
        ))}
      </select>
    </label>
  );
}
