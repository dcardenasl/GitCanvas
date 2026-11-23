import { useEffect, useRef, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import type { FetchTagOutcome, ReleaseAssetInfoIpc } from "../../bindings";
import { openExternalUrl } from "../../lib/ipc";
import {
  discardPendingReleaseAction,
  releaseQueryKey,
  useCancelReleaseTransfer,
  useDownloadReleaseAsset,
  useFetchReleaseTag,
  usePendingReleaseAction,
  useReleaseAssets,
  useReleaseDownloadProgress,
  useReleaseTransfers,
  useReleases,
} from "../../state/releases";
import type { ReleaseTransferState } from "../../state/releases";
import { useNavigationActions } from "../../state/workspace";
import { invalidateLive } from "../../state/queryKeys";
import { errorKind } from "../../lib/errors";
import { ErrorMessage } from "../ErrorMessage";
import { ReleaseAccessForm } from "./ReleaseAccessForm";
import { resolveMarkdownLink } from "./markdownLinks";
import {
  formatReleaseDate,
  latestStableReleaseId,
} from "./releasePresentation";

import "./ReleaseDetailView.css";

function isAccessRequired(error: unknown): boolean {
  return errorKind(error) === "AccessRequired";
}

function transferProgress(
  transfer: ReleaseTransferState,
): { readonly downloaded: number; readonly total: number } | null {
  if (transfer.totalBytes === null) return null;
  const downloaded = Number(transfer.downloadedBytes);
  const total = Number(transfer.totalBytes);
  if (
    !Number.isSafeInteger(downloaded) ||
    !Number.isSafeInteger(total) ||
    downloaded < 0 ||
    total <= 0
  )
    return null;
  return { downloaded: Math.min(downloaded, total), total };
}

function focusReleaseRow(releaseId: string): void {
  const focus = () => {
    const row = [
      ...document.querySelectorAll<HTMLButtonElement>("[data-release-row]"),
    ].find((candidate) => candidate.dataset.releaseRow === releaseId);
    (
      row ?? document.querySelector<HTMLButtonElement>("[data-releases-toggle]")
    )?.focus();
  };
  if (typeof window.requestAnimationFrame === "function")
    window.requestAnimationFrame(focus);
  else window.setTimeout(focus, 0);
}

function ReleaseNoteLink({
  href,
  releaseUrl,
  children,
  onError,
}: {
  readonly href: string | undefined;
  readonly releaseUrl: string | null;
  readonly children: ReactNode;
  readonly onError: (error: unknown) => void;
}) {
  const { t } = useTranslation("releases");
  const target = resolveMarkdownLink(href, releaseUrl);
  const [opening, setOpening] = useState(false);

  if (target === null)
    return (
      <span className="release-detail__link-text">
        {children}
        {href !== undefined && href !== children && (
          <code className="release-detail__link-destination">{href}</code>
        )}
      </span>
    );

  return (
    <span className="release-detail__link-group">
      <button
        className="release-detail__link"
        type="button"
        aria-label={t("openExternalLink", { url: target })}
        aria-busy={opening}
        disabled={opening}
        onClick={() => {
          onError(null);
          setOpening(true);
          void openExternalUrl(target)
            .then(() => {
              setOpening(false);
            })
            .catch((error: unknown) => {
              onError(error);
              setOpening(false);
            });
        }}
      >
        {children}
      </button>
      {target !== children && (
        <code className="release-detail__link-destination">{target}</code>
      )}
    </span>
  );
}

/** Central reader for one published GitHub release and its downloadable assets. */
export function ReleaseDetailView({
  repositoryPath,
  releaseId,
}: {
  readonly repositoryPath: string;
  readonly releaseId: string;
}) {
  const { t, i18n } = useTranslation("releases");
  const queryClient = useQueryClient();
  const { closeRelease } = useNavigationActions();
  const query = useReleases(repositoryPath);
  const entry = query.data?.entries.find(
    (candidate) =>
      candidate.kind === "release" && candidate.release.id === releaseId,
  );
  const releaseEntry = entry?.kind === "release" ? entry : null;
  const release = releaseEntry?.release ?? null;
  const assets = useReleaseAssets(repositoryPath, release?.id ?? null);
  const pendingAction = usePendingReleaseAction(repositoryPath, true);
  const fetchTag = useFetchReleaseTag(repositoryPath);
  const download = useDownloadReleaseAsset(repositoryPath);
  const cancelTransfer = useCancelReleaseTransfer(repositoryPath);
  const transfers = useReleaseTransfers(repositoryPath);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [tokenAccessSaved, setTokenAccessSaved] = useState(false);
  const [downloadNeedsRetry, setDownloadNeedsRetry] = useState(false);
  const [manualRetryReady, setManualRetryReady] = useState(false);
  const [fetchResult, setFetchResult] = useState<{
    readonly tagName: string;
    readonly outcome: FetchTagOutcome;
  } | null>(null);
  const [cancelError, setCancelError] = useState<Error | null>(null);
  const [linkError, setLinkError] = useState<unknown>(null);
  useReleaseDownloadProgress(repositoryPath);
  const latestId = latestStableReleaseId(query.data?.entries ?? []);

  useEffect(() => {
    titleRef.current?.focus();
  }, [releaseId]);

  useEffect(() => {
    if (pendingAction === null) return;
    const belongsToView =
      (pendingAction.kind === "getReleaseAssets" &&
        pendingAction.releaseId === releaseId) ||
      (pendingAction.kind === "fetchTag" &&
        pendingAction.tagName === release?.tag_name);
    if (!belongsToView) discardPendingReleaseAction();
  }, [pendingAction, release?.tag_name, releaseId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key !== "Escape" ||
        event.defaultPrevented ||
        document.querySelector('[role="menu"], [role="dialog"]') !== null
      )
        return;
      event.preventDefault();
      closeRelease();
      focusReleaseRow(releaseId);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [closeRelease, releaseId]);

  const accessError = [query.error, assets.error, fetchTag.error].some(
    isAccessRequired,
  );
  const accessChallenge =
    (pendingAction !== null && accessError) ||
    (downloadNeedsRetry && !tokenAccessSaved) ||
    (pendingAction === null && accessError && !manualRetryReady);

  async function fetchTagForRelease(tagName: string): Promise<void> {
    setFetchResult(null);
    setManualRetryReady(false);
    try {
      const outcome = await fetchTag.mutateAsync({ tagName });
      setFetchResult({ tagName, outcome });
      if (outcome.kind === "Fetched")
        await Promise.all([
          invalidateLive(queryClient, repositoryPath, "metadata"),
          queryClient.invalidateQueries({
            queryKey: releaseQueryKey.releases(repositoryPath),
          }),
        ]);
    } catch {
      // The mutation retains its typed error for the recovery state below.
    }
  }

  async function downloadAsset(asset: ReleaseAssetInfoIpc): Promise<void> {
    if (release === null) return;
    setDownloadNeedsRetry(false);
    setTokenAccessSaved(false);
    setManualRetryReady(false);
    try {
      await download.mutateAsync({
        releaseId,
        assetId: asset.id,
        transferId: crypto.randomUUID(),
      });
    } catch (error) {
      if (isAccessRequired(error)) setDownloadNeedsRetry(true);
    }
  }

  async function cancel(transferId: string): Promise<void> {
    setCancelError(null);
    try {
      await cancelTransfer.mutateAsync({ transferId });
    } catch (error) {
      setCancelError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  function closeDetails(): void {
    closeRelease();
    focusReleaseRow(releaseId);
  }

  const accessMessage = downloadNeedsRetry
    ? t("access.downloadRetry")
    : pendingAction === null
      ? t("access.requiredNoPending")
      : t("access.required");

  return (
    <section className="release-detail" aria-labelledby="release-detail-title">
      {release === null ? (
        <div
          className="release-detail__state"
          role={query.isError ? "alert" : "status"}
        >
          {query.isLoading && <p>{t("loading")}</p>}
          {query.isError && <ErrorMessage error={query.error} />}
          {!query.isLoading && <p>{t("unavailable")}</p>}
          {query.isError && (
            <button
              type="button"
              className="button"
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
            >
              {query.isFetching ? t("retrying") : t("retryReleases")}
            </button>
          )}
          {accessChallenge && (
            <ReleaseAccessForm
              repositoryPath={repositoryPath}
              action={
                pendingAction?.kind === "getReleases" ? pendingAction : null
              }
              scope="detail"
              message={t("access.requiredNoPending")}
              onSaved={() => {
                setManualRetryReady(true);
              }}
            />
          )}
          <button
            type="button"
            className="button release-detail__close"
            onClick={closeDetails}
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="m4 4 8 8m0-8-8 8" />
            </svg>
            {t("closeDetails")}
          </button>
        </div>
      ) : (
        <>
          <header className="release-detail__header">
            <div className="release-detail__identity">
              <div className="release-detail__heading">
                <h1
                  id="release-detail-title"
                  ref={titleRef}
                  tabIndex={-1}
                  className="release-detail__title"
                >
                  {release.name ?? release.tag_name}
                </h1>
                <code className="release-detail__tag">{release.tag_name}</code>
              </div>
              <div className="release-detail__badges">
                {release.id === latestId && (
                  <span className="tags-releases-panel__badge">
                    {t("latest")}
                  </span>
                )}
                {release.prerelease && (
                  <span className="tags-releases-panel__badge tags-releases-panel__badge--muted">
                    {t("prerelease")}
                  </span>
                )}
              </div>
              {release.published_at !== null && (
                <p className="release-detail__published">
                  {t("published", {
                    date: formatReleaseDate(
                      release.published_at,
                      i18n.resolvedLanguage ?? i18n.language,
                    ),
                  })}
                </p>
              )}
              {query.data?.cached_at != null && (
                <p className="tags-releases-panel__notice" role="status">
                  {t("cached", {
                    date: formatReleaseDate(
                      query.data.cached_at,
                      i18n.resolvedLanguage ?? i18n.language,
                    ),
                  })}
                </p>
              )}
              {query.data?.rate_limit_reset != null && (
                <p className="tags-releases-panel__notice" role="status">
                  {t("rateLimit", {
                    date: formatReleaseDate(
                      query.data.rate_limit_reset,
                      i18n.resolvedLanguage ?? i18n.language,
                    ),
                  })}
                </p>
              )}
            </div>
            <button
              type="button"
              className="button release-detail__close"
              onClick={closeDetails}
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="m4 4 8 8m0-8-8 8" />
              </svg>
              {t("closeDetails")}
            </button>
          </header>

          <section
            className="release-detail__section"
            aria-labelledby="release-notes-title"
          >
            <h2 id="release-notes-title">{t("notesTitle")}</h2>
            {release.notes === "" ? (
              <p className="tags-releases-panel__notice">{t("noNotes")}</p>
            ) : (
              <div className="release-detail__notes" dir="auto">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  urlTransform={(url) => url}
                  components={{
                    a: ({ href, children }) => (
                      <ReleaseNoteLink
                        href={href}
                        releaseUrl={release.html_url}
                        onError={setLinkError}
                      >
                        {children}
                      </ReleaseNoteLink>
                    ),
                    img: () => null,
                  }}
                >
                  {release.notes}
                </ReactMarkdown>
              </div>
            )}
            {linkError !== null && (
              <div className="release-detail__link-error" role="alert">
                <ErrorMessage error={linkError} lead={t("openLinkFailed")} />
              </div>
            )}
          </section>

          <section
            className="release-detail__section"
            aria-labelledby="release-meta-title"
          >
            <h2 id="release-meta-title">{t("availabilityTitle")}</h2>
            {releaseEntry !== null && releaseEntry.local_tag !== null ? (
              <p className="release-detail__availability">
                {t("availableLocally")}
              </p>
            ) : query.data?.local_tags_available ? (
              <p className="release-detail__availability">
                {t("availableToFetch")}
              </p>
            ) : (
              <p className="release-detail__availability">
                {t("localStatusUnavailable")}
              </p>
            )}
            {query.data?.local_tags_available &&
              releaseEntry !== null &&
              releaseEntry.local_tag === null && (
                <button
                  type="button"
                  className="button"
                  disabled={pendingAction !== null || fetchTag.isPending}
                  onClick={() => void fetchTagForRelease(release.tag_name)}
                >
                  {fetchTag.isPending
                    ? t("tag.fetching")
                    : t("tag.fetch", { tag: release.tag_name })}
                </button>
              )}
            {fetchTag.error !== null && <ErrorMessage error={fetchTag.error} />}
            {fetchResult !== null && (
              <p className="tags-releases-panel__notice" role="status">
                {t(`tag.result.${fetchResult.outcome.kind}`, {
                  tag: fetchResult.tagName,
                  local:
                    fetchResult.outcome.kind === "Conflict"
                      ? fetchResult.outcome.local_target
                      : "",
                  remote:
                    fetchResult.outcome.kind === "Conflict"
                      ? fetchResult.outcome.remote_target
                      : "",
                })}
              </p>
            )}
          </section>

          <section
            className="release-detail__section"
            aria-labelledby="release-assets-title"
          >
            <h2 id="release-assets-title">{t("assets.title")}</h2>
            {assets.isLoading && (
              <p className="tags-releases-panel__notice" role="status">
                {t("assets.loading")}
              </p>
            )}
            {assets.isError && (
              <div role="alert">
                <ErrorMessage error={assets.error} />
                {!isAccessRequired(assets.error) && (
                  <button
                    type="button"
                    className="button"
                    disabled={assets.isFetching}
                    onClick={() => {
                      setManualRetryReady(false);
                      void assets.refetch();
                    }}
                  >
                    {assets.isFetching
                      ? t("assets.retrying")
                      : t("assets.retry")}
                  </button>
                )}
              </div>
            )}
            {assets.data !== undefined && (
              <>
                {assets.data.assets.length === 0 ? (
                  <p className="tags-releases-panel__notice" role="status">
                    {t("assets.empty")}
                  </p>
                ) : (
                  <ul className="release-detail__asset-list">
                    {assets.data.assets.map((asset) => {
                      const transfer = [...transfers]
                        .reverse()
                        .find(
                          (candidate) =>
                            candidate.releaseId === release.id &&
                            candidate.assetId === asset.id,
                        );
                      const progress =
                        transfer === undefined
                          ? null
                          : transferProgress(transfer);
                      const activeTransfer =
                        transfer?.status === "starting" ||
                        transfer?.status === "downloading";
                      return (
                        <li className="release-detail__asset" key={asset.id}>
                          <div className="release-detail__asset-description">
                            <span className="release-detail__asset-name">
                              {asset.name}
                            </span>
                            <span className="release-detail__asset-size">
                              {t("assets.size", { bytes: asset.size })}
                            </span>
                          </div>
                          {transfer !== undefined && (
                            <div
                              className="release-detail__transfer"
                              role="status"
                              aria-live="polite"
                            >
                              <span>
                                {t(`transfer.${transfer.status}`)}
                                {transfer.status === "downloading" &&
                                  ` · ${t("transfer.bytes", {
                                    downloaded: transfer.downloadedBytes,
                                    total: transfer.totalBytes ?? "?",
                                  })}`}
                              </span>
                              {progress !== null && (
                                <progress
                                  max={progress.total}
                                  value={progress.downloaded}
                                  aria-label={t("transfer.progressLabel", {
                                    asset: asset.name,
                                  })}
                                />
                              )}
                            </div>
                          )}
                          {transfer?.status === "failed" && (
                            <p
                              className="tags-releases-panel__notice"
                              role="status"
                            >
                              {t("transfer.failed")}
                            </p>
                          )}
                          {download.error !== null && (
                            <ErrorMessage error={download.error} />
                          )}
                          <div className="release-detail__asset-actions">
                            <button
                              type="button"
                              className="button button--primary"
                              disabled={
                                download.isPending ||
                                pendingAction !== null ||
                                activeTransfer
                              }
                              onClick={() => void downloadAsset(asset)}
                            >
                              {t("assets.download")}
                            </button>
                            {activeTransfer && (
                              <button
                                type="button"
                                className="button"
                                disabled={cancelTransfer.isPending}
                                onClick={() => void cancel(transfer.transferId)}
                              >
                                {t("transfer.cancel")}
                              </button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {assets.data.truncated && (
                  <p className="tags-releases-panel__notice" role="status">
                    {t("assets.truncated")}
                  </p>
                )}
              </>
            )}
          </section>

          {cancelError !== null && <ErrorMessage error={cancelError} />}
          {accessChallenge && (
            <ReleaseAccessForm
              repositoryPath={repositoryPath}
              action={pendingAction}
              scope="detail"
              message={accessMessage}
              onSaved={(action) => {
                if (action?.kind === "fetchTag") {
                  fetchTag.reset();
                  void Promise.all([
                    invalidateLive(queryClient, repositoryPath, "metadata"),
                    queryClient.invalidateQueries({
                      queryKey: releaseQueryKey.releases(repositoryPath),
                    }),
                  ]);
                } else if (action === null && downloadNeedsRetry) {
                  setTokenAccessSaved(true);
                } else {
                  setManualRetryReady(true);
                }
              }}
            />
          )}
          {downloadNeedsRetry && tokenAccessSaved && (
            <p className="tags-releases-panel__notice" role="status">
              {t("access.retryDownload")}
            </p>
          )}
          {manualRetryReady && !downloadNeedsRetry && (
            <p className="tags-releases-panel__notice" role="status">
              {t("access.retryAction")}
            </p>
          )}
        </>
      )}
    </section>
  );
}
