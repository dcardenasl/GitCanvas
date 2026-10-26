import { useState } from "react";
import { useTranslation } from "react-i18next";

interface SidebarHeaderProps {
  readonly search: string;
  readonly headIncluded: boolean;
  readonly hasReferences: boolean;
  readonly canUndo: boolean;
  readonly onSearchChange: (search: string) => void;
  readonly onHeadToggle: (included: boolean) => void;
  readonly onShowAll: () => void;
  readonly onUndo: () => void;
  readonly onOpenOptions: (x: number, y: number) => void;
}

/** Search, quick filters, and help for the reference explorer. */
export function SidebarHeader({
  search,
  headIncluded,
  hasReferences,
  canUndo,
  onSearchChange,
  onHeadToggle,
  onShowAll,
  onUndo,
  onOpenOptions,
}: SidebarHeaderProps) {
  const { t } = useTranslation("refs");
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <div className="sidebar__header">
      <div className="sidebar__title-row">
        <div className="sidebar__title-group">
          <h2 className="sidebar__title">{t("title")}</h2>
          <button
            type="button"
            className="sidebar__help-btn"
            aria-label={t("help.title")}
            title={t("help.summary")}
            aria-expanded={helpOpen}
            onClick={() => {
              setHelpOpen((open) => !open);
            }}
          >
            ?
          </button>
        </div>
        <div className="sidebar__header-actions">
          <button
            type="button"
            className="sidebar__header-btn"
            disabled={!canUndo}
            aria-label={t("undo")}
            title={t("undo")}
            onClick={onUndo}
          >
            <svg
              viewBox="0 0 16 16"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M2.5 6.5h7a3.5 3.5 0 0 1 3.5 3.5v0a3.5 3.5 0 0 1-3.5 3.5H6" />
              <path d="m5 4-2.5 2.5L5 9" />
            </svg>
          </button>
          <button
            type="button"
            className="sidebar__header-btn"
            aria-label={t("options")}
            title={t("options")}
            aria-haspopup="menu"
            onClick={(event) => {
              const bounds = event.currentTarget.getBoundingClientRect();
              onOpenOptions(bounds.left, bounds.bottom);
            }}
          >
            <span className="sidebar__dots" aria-hidden="true" />
          </button>
        </div>
      </div>

      {helpOpen && (
        <div
          className="sidebar__help-card"
          role="region"
          aria-label={t("help.title")}
        >
          <div className="sidebar__help-header">
            <strong>{t("help.title")}</strong>
            <button
              type="button"
              className="sidebar__help-close"
              aria-label={t("help.close")}
              onClick={() => {
                setHelpOpen(false);
              }}
            >
              ×
            </button>
          </div>
          <ul className="sidebar__help-list">
            <li>
              <span className="sidebar__help-icon">▾ / ▸</span>
              <span>{t("help.expand")}</span>
            </li>
            <li>
              <span className="sidebar__help-icon" aria-hidden="true">
                <svg
                  viewBox="0 0 16 16"
                  width="13"
                  height="13"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 4h10M8 4v9M6 13h4" />
                </svg>
              </span>
              <span>{t("help.navigate")}</span>
            </li>
            <li>
              <span className="sidebar__help-icon">👁️</span>
              <span>{t("help.visibility")}</span>
            </li>
            <li>
              <span className="sidebar__help-icon">…</span>
              <span>{t("help.actions")}</span>
            </li>
          </ul>
          <p className="sidebar__help-note">{t("help.commitNote")}</p>
        </div>
      )}

      <div className="sidebar__search-row">
        <label
          className="sidebar__search-label visually-hidden"
          htmlFor="reference-search"
        >
          {t("search")}
        </label>
        <div className="sidebar__search-input-wrapper">
          <svg
            className="sidebar__search-icon"
            viewBox="0 0 16 16"
            width="13"
            height="13"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="7" cy="7" r="4.5" />
            <path d="m10.5 10.5 3.5 3.5" />
          </svg>
          <input
            id="reference-search"
            type="search"
            value={search}
            placeholder={t("searchPlaceholder")}
            onChange={(event) => {
              onSearchChange(event.target.value);
            }}
          />
          {search !== "" && (
            <button
              type="button"
              className="sidebar__search-clear"
              aria-label={t("clearSearch")}
              title={t("clearSearch")}
              onClick={() => {
                onSearchChange("");
              }}
            >
              ×
            </button>
          )}
        </div>
      </div>

      <div className="sidebar__quick-bar">
        <label className="sidebar__head-label">
          <input
            type="checkbox"
            checked={headIncluded}
            onChange={(event) => {
              onHeadToggle(event.target.checked);
            }}
          />
          <span>{t("headFilter")}</span>
        </label>
        <button
          type="button"
          className="sidebar__quick-show-all"
          disabled={!hasReferences}
          onClick={onShowAll}
        >
          {t("showAll")}
        </button>
      </div>
    </div>
  );
}
