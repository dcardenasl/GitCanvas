import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { LanguageSelector } from "../LanguageSelector";
import { ThemeSelector } from "../ThemeSelector/ThemeSelector";

import "./PreferencesMenu.css";

/**
 * Window-level preferences behind one compact toolbar control.
 *
 * Theme and language were two selects of their own, which cost the toolbar more
 * width than the 940px minimum window has once labels grow in another language.
 * One button keeps the toolbar's size independent of how many preferences there
 * are, so the next one does not reopen the question.
 */
export function PreferencesMenu() {
  const { t } = useTranslation("shell");
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    function closeOnOutsidePress(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        root.current?.contains(event.target) !== true
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", closeOnOutsidePress);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
    };
  }, [open]);

  return (
    <div
      ref={root}
      className="preferences-menu"
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !open) return;
        // Closing this panel is all Escape should do: the same key also leaves
        // the file view, and it must not do both at once.
        event.stopPropagation();
        setOpen(false);
        toggle.current?.focus();
      }}
    >
      <button
        ref={toggle}
        type="button"
        className="button preferences-menu__toggle"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={t("preferences.label")}
        title={t("preferences.label")}
        onClick={() => {
          setOpen((current) => !current);
        }}
      >
        {/* An SVG rather than the ⚙ character: that glyph is drawn from a
            different font, sometimes as a colour emoji, on each platform. */}
        <svg
          className="preferences-menu__icon"
          viewBox="0 0 16 16"
          aria-hidden="true"
          focusable="false"
        >
          <path
            fill="currentColor"
            d="M9.4 1.5 9.1 3a5 5 0 0 1 1.3.8l1.4-.6 1.4 2.4-1.2 1a5 5 0 0 1 0 1.5l1.2 1-1.4 2.4-1.4-.6a5 5 0 0 1-1.3.8l-.3 1.5H6.6l-.3-1.5a5 5 0 0 1-1.3-.8l-1.4.6-1.4-2.4 1.2-1a5 5 0 0 1 0-1.5l-1.2-1L3.6 3.2l1.4.6A5 5 0 0 1 6.3 3l.3-1.5ZM8 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z"
          />
        </svg>
      </button>
      <div
        id={panelId}
        className="preferences-menu__panel"
        role="group"
        aria-label={t("preferences.panel")}
        hidden={!open}
      >
        <ThemeSelector />
        <LanguageSelector />
      </div>
    </div>
  );
}
