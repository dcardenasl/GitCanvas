import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  useNavigation,
  useNavigationActions,
  useActiveRepository,
} from "../../state/workspace";
import { usePendingReleaseAction, useReleases } from "../../state/releases";
import { errorKind } from "../../lib/errors";
import { ErrorMessage } from "../ErrorMessage";
import { ReleaseAccessForm } from "./ReleaseAccessForm";
import {
  formatReleaseDate,
  latestStableReleaseId,
} from "./releasePresentation";

import "./TagsReleasesPanel.css";

const noop = () => undefined;

/** Compact navigation list for published releases; details live in the center view. */
export function TagsReleasesPanel({
  panelOpen = true,
  collapsed = false,
  onCollapse = noop,
}: {
  readonly panelOpen?: boolean;
  readonly collapsed?: boolean;
  readonly onCollapse?: () => void;
}) {
  const { t, i18n } = useTranslation("releases");
  const repository = useActiveRepository();
  const root = repository?.path ?? null;
  const query = useReleases(root);
  const releaseView = useNavigation((navigation) => navigation.releaseView);
  const { openRelease } = useNavigationActions();
  const [manualRetryReady, setManualRetryReady] = useState(false);
  const expanded = !collapsed;
  const active = panelOpen && expanded && releaseView === null;
  const pendingAction = usePendingReleaseAction(root, active);
  const isAccessRequired = errorKind(query.error) === "AccessRequired";
  const accessChallenge =
    isAccessRequired && !manualRetryReady && query.error !== null;
  const releases =
    query.data?.entries.filter((entry) => entry.kind === "release") ?? [];
  const latestReleaseId = latestStableReleaseId(query.data?.entries ?? []);

  return (
    <section className="tags-releases-panel" aria-label={t("title")}>
      <div className="sidebar__label">
        <button
          type="button"
          className="sidebar__section-toggle"
          data-releases-toggle="true"
          aria-expanded={expanded}
          aria-controls="tags-releases-content"
          onClick={onCollapse}
        >
          <span className="sidebar__chevron" aria-hidden="true">
            {expanded ? "▾" : "▸"}
          </span>
          {t("title")}
        </button>
      </div>
      <div
        id="tags-releases-content"
        className="tags-releases-panel__content"
        hidden={!expanded}
      >
        {query.isLoading && (
          <p className="tags-releases-panel__notice" role="status">
            {t("loading")}
          </p>
        )}
        {query.isError && (
          <div role="alert">
            <ErrorMessage error={query.error} />
          </div>
        )}
        {query.isError && !accessChallenge && (
          <button
            type="button"
            className="button tags-releases-panel__retry"
            disabled={query.isFetching}
            onClick={() => {
              setManualRetryReady(false);
              void query.refetch();
            }}
          >
            {query.isFetching ? t("retrying") : t("retryReleases")}
          </button>
        )}
        {query.data?.cached_at !== null &&
          query.data?.cached_at !== undefined && (
            <p className="tags-releases-panel__notice" role="status">
              {t("cached", {
                date: formatReleaseDate(
                  query.data.cached_at,
                  i18n.resolvedLanguage ?? i18n.language,
                ),
              })}
            </p>
          )}
        {query.data?.rate_limit_reset !== null &&
          query.data?.rate_limit_reset !== undefined && (
            <p className="tags-releases-panel__notice" role="status">
              {t("rateLimit", {
                date: formatReleaseDate(
                  query.data.rate_limit_reset,
                  i18n.resolvedLanguage ?? i18n.language,
                ),
              })}
            </p>
          )}
        {query.data !== undefined && releases.length === 0 && (
          <p className="tags-releases-panel__notice" role="status">
            {t("empty")}
          </p>
        )}
        {releases.length > 0 && (
          <ul className="tags-releases-panel__list" aria-label={t("listLabel")}>
            {releases.map(({ release }) => {
              const selected = releaseView?.releaseId === release.id;
              return (
                <li className="tags-releases-panel__item" key={release.id}>
                  <button
                    type="button"
                    className="tags-releases-panel__release"
                    data-release-row={release.id}
                    aria-current={selected ? "true" : undefined}
                    onClick={() => {
                      openRelease(release.id);
                    }}
                  >
                    <span className="tags-releases-panel__release-title">
                      {release.name ?? release.tag_name}
                    </span>
                    <span className="tags-releases-panel__release-tag">
                      {release.tag_name}
                    </span>
                    <span className="tags-releases-panel__badges">
                      {release.id === latestReleaseId && (
                        <span className="tags-releases-panel__badge">
                          {t("latest")}
                        </span>
                      )}
                      {release.prerelease && (
                        <span className="tags-releases-panel__badge tags-releases-panel__badge--muted">
                          {t("prerelease")}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {query.data?.truncated && (
          <p className="tags-releases-panel__notice" role="status">
            {t("truncated")}
          </p>
        )}
        {accessChallenge && pendingAction !== null && (
          <ReleaseAccessForm
            repositoryPath={root ?? ""}
            action={pendingAction}
            scope="list"
            onSaved={(action) => {
              if (action === null) setManualRetryReady(true);
            }}
          />
        )}
        {manualRetryReady && (
          <p className="tags-releases-panel__notice" role="status">
            {t("access.retryAction")}
          </p>
        )}
      </div>
    </section>
  );
}
