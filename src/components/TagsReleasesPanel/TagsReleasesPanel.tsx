import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useReleases } from "../../state/releases";
import { useActiveRepository } from "../../state/workspace";
import { ErrorMessage } from "../ErrorMessage";

import "./TagsReleasesPanel.css";

function formatDate(value: string, locale: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

/** One repository-scoped view of published releases and local-only tags. */
export function TagsReleasesPanel() {
  const { t, i18n } = useTranslation("releases");
  const repository = useActiveRepository();
  const query = useReleases(repository?.path ?? null);
  const [expanded, setExpanded] = useState(true);

  return (
    <section className="tags-releases-panel" aria-labelledby="releases-title">
      <div className="tags-releases-panel__heading">
        <button
          type="button"
          className="sidebar__section-toggle"
          aria-expanded={expanded}
          aria-controls="tags-releases-content"
          onClick={() => {
            setExpanded((value) => !value);
          }}
        >
          <span className="sidebar__chevron" aria-hidden="true">
            {expanded ? "▾" : "▸"}
          </span>
          <span id="releases-title">{t("title")}</span>
        </button>
      </div>
      {expanded && (
        <div
          id="tags-releases-content"
          className="tags-releases-panel__content"
        >
          {query.isLoading && <p role="status">{t("loading")}</p>}
          {query.isError && <ErrorMessage error={query.error} />}
          {query.data != null && (
            <>
              {query.data.cached_at !== null && (
                <p className="tags-releases-panel__notice" role="status">
                  {t("cached", {
                    date: formatDate(
                      query.data.cached_at,
                      i18n.resolvedLanguage ?? i18n.language,
                    ),
                  })}
                </p>
              )}
              {query.data.rate_limit_reset !== null && (
                <p className="tags-releases-panel__notice" role="status">
                  {t("rateLimit", {
                    date: formatDate(
                      query.data.rate_limit_reset,
                      i18n.resolvedLanguage ?? i18n.language,
                    ),
                  })}
                </p>
              )}
              {!query.data.local_tags_available && (
                <p className="tags-releases-panel__notice" role="status">
                  {t("localTagsUnavailable")}
                </p>
              )}
              {query.data.entries.length === 0 ? (
                <p className="tags-releases-panel__notice" role="status">
                  {t("empty")}
                </p>
              ) : (
                <ul
                  className="tags-releases-panel__list"
                  aria-label={t("listLabel")}
                >
                  {query.data.entries.map((entry) =>
                    entry.kind === "release" ? (
                      <li
                        className="tags-releases-panel__item"
                        key={`release:${entry.release.id}`}
                      >
                        <h3 className="tags-releases-panel__name">
                          {entry.release.name ?? entry.release.tag_name}
                        </h3>
                        <p className="tags-releases-panel__tag">
                          {entry.release.tag_name}
                        </p>
                        <p className="tags-releases-panel__state">
                          {!query.data.local_tags_available
                            ? t("localStatusUnavailable")
                            : entry.local_tag === null
                              ? t("availableToFetch")
                              : t("availableLocally")}
                        </p>
                        {entry.release.prerelease && (
                          <p className="tags-releases-panel__badge">
                            {t("prerelease")}
                          </p>
                        )}
                        {entry.release.notes !== "" && (
                          <p className="tags-releases-panel__notes">
                            {entry.release.notes}
                          </p>
                        )}
                      </li>
                    ) : (
                      <li
                        className="tags-releases-panel__item"
                        key={`local:${entry.tag.name}`}
                      >
                        <h3 className="tags-releases-panel__name">
                          {entry.tag.name}
                        </h3>
                        <p className="tags-releases-panel__state">
                          {t("localTag")}
                        </p>
                      </li>
                    ),
                  )}
                </ul>
              )}
              {query.data.truncated && (
                <p className="tags-releases-panel__notice" role="status">
                  {t("truncated")}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
