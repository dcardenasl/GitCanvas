import { useLayoutEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import type { FetchTagOutcome, ReleaseAssetInfoIpc } from "../../bindings";
import {
  releaseQueryKey,
  getPendingReleaseAction,
  resumePendingReleaseAction,
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
import { useActiveRepository } from "../../state/workspace";
import { invalidateLive } from "../../state/queryKeys";
import { errorKind } from "../../lib/errors";
import { storeGithubToken } from "../../lib/ipc";
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

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

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

/** One repository-scoped view of releases, tags and explicit release actions. */
export function TagsReleasesPanel({
  panelOpen = true,
}: {
  readonly panelOpen?: boolean;
}) {
  const { t, i18n } = useTranslation("releases");
  const repository = useActiveRepository();
  const root = repository?.path ?? null;
  const queryClient = useQueryClient();
  const query = useReleases(root);
  const [expanded, setExpanded] = useState(true);
  const [selectedReleaseId, setSelectedReleaseId] = useState<string | null>(
    null,
  );
  const [token, setToken] = useState("");
  const [savingToken, setSavingToken] = useState(false);
  const [tokenError, setTokenError] = useState<Error | null>(null);
  const [resumeError, setResumeError] = useState<Error | null>(null);
  const [downloadNeedsRetry, setDownloadNeedsRetry] = useState(false);
  const [downloadTokenSaved, setDownloadTokenSaved] = useState(false);
  const [manualRetryReady, setManualRetryReady] = useState(false);
  const [cancelError, setCancelError] = useState<Error | null>(null);
  const [fetchResult, setFetchResult] = useState<{
    readonly tagName: string;
    readonly outcome: FetchTagOutcome;
  } | null>(null);
  const panelActive = panelOpen && expanded;
  const panelActiveRef = useRef(panelActive);
  const activeRootRef = useRef(root);
  useLayoutEffect(() => {
    panelActiveRef.current = panelActive;
    activeRootRef.current = root;
  }, [panelActive, root]);
  const pendingAction = usePendingReleaseAction(root, panelActive);
  const assets = useReleaseAssets(root, panelActive ? selectedReleaseId : null);
  const fetchTag = useFetchReleaseTag(root);
  const download = useDownloadReleaseAsset(root);
  const cancelTransfer = useCancelReleaseTransfer(root);
  const transfers = useReleaseTransfers(root);
  useReleaseDownloadProgress(panelActive ? root : null);

  const hasActionAccessError = [query.error, assets.error, fetchTag.error].some(
    isAccessRequired,
  );
  const accessChallenge =
    (pendingAction !== null && hasActionAccessError) ||
    (downloadNeedsRetry && !downloadTokenSaved) ||
    (pendingAction === null &&
      hasActionAccessError &&
      !manualRetryReady &&
      !(resumeError !== null && isAccessRequired(resumeError)));

  async function fetchTagForRelease(tagName: string): Promise<void> {
    if (root === null) return;
    setResumeError(null);
    setFetchResult(null);
    setManualRetryReady(false);
    try {
      const outcome = await fetchTag.mutateAsync({ tagName });
      setFetchResult({ tagName, outcome });
      if (outcome.kind === "Fetched") {
        await Promise.all([
          invalidateLive(queryClient, root, "metadata"),
          queryClient.invalidateQueries({
            queryKey: releaseQueryKey.releases(root),
          }),
        ]);
      }
    } catch {
      // The typed mutation state carries the error for the recovery panel.
    }
  }

  async function downloadAsset(
    releaseId: string,
    asset: ReleaseAssetInfoIpc,
  ): Promise<void> {
    setDownloadNeedsRetry(false);
    setDownloadTokenSaved(false);
    setManualRetryReady(false);
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

  async function saveTokenAndResume(): Promise<void> {
    if (root === null || token.trim() === "" || savingToken) return;
    const action = pendingAction;
    setSavingToken(true);
    setTokenError(null);
    setResumeError(null);
    try {
      await storeGithubToken(token.trim());
    } catch (error) {
      setTokenError(toError(error));
      setSavingToken(false);
      return;
    }
    setToken("");
    try {
      if (!panelActiveRef.current || activeRootRef.current !== root) return;
      if (action !== null) {
        if (getPendingReleaseAction() !== action) return;
        await resumePendingReleaseAction(root, queryClient);
        if (action.kind === "fetchTag") {
          fetchTag.reset();
          await Promise.all([
            invalidateLive(queryClient, root, "metadata"),
            queryClient.invalidateQueries({
              queryKey: releaseQueryKey.releases(root),
            }),
          ]);
        }
      } else if (downloadNeedsRetry) {
        // Rust owns the save dialog, so downloads require a new explicit click.
        setDownloadTokenSaved(true);
        setManualRetryReady(true);
      } else if (hasActionAccessError) {
        // A closed panel may have discarded the request; the next attempt is explicit.
        setManualRetryReady(true);
      }
    } catch (error) {
      setResumeError(toError(error));
    } finally {
      setSavingToken(false);
    }
  }

  async function cancel(transferId: string): Promise<void> {
    setCancelError(null);
    try {
      await cancelTransfer.mutateAsync({ transferId });
    } catch (error) {
      setCancelError(toError(error));
    }
  }

  return (
    <section className="tags-releases-panel" aria-labelledby="releases-title">
      <div className="tags-releases-panel__heading">
        <button
          type="button"
          className="sidebar__section-toggle"
          aria-expanded={expanded}
          aria-controls="tags-releases-content"
          onClick={() => {
            if (expanded) setToken("");
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
          {query.isError && (
            <button
              type="button"
              className="button"
              disabled={query.isFetching}
              onClick={() => {
                setManualRetryReady(false);
                void query.refetch();
              }}
            >
              {query.isFetching ? t("retrying") : t("retryReleases")}
            </button>
          )}
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
                        <div className="tags-releases-panel__actions">
                          <button
                            type="button"
                            className="button"
                            aria-expanded={
                              selectedReleaseId === entry.release.id
                            }
                            aria-controls={`release-assets-${entry.release.id}`}
                            disabled={pendingAction !== null || !panelActive}
                            onClick={() => {
                              setSelectedReleaseId((current) =>
                                current === entry.release.id
                                  ? null
                                  : entry.release.id,
                              );
                              setManualRetryReady(false);
                            }}
                          >
                            {selectedReleaseId === entry.release.id
                              ? t("assets.hide", {
                                  tag: entry.release.tag_name,
                                })
                              : t("assets.show", {
                                  tag: entry.release.tag_name,
                                })}
                          </button>
                          {query.data.local_tags_available &&
                            entry.local_tag === null && (
                              <button
                                type="button"
                                className="button"
                                disabled={
                                  pendingAction !== null ||
                                  fetchTag.isPending ||
                                  !panelActive
                                }
                                onClick={() => {
                                  void fetchTagForRelease(
                                    entry.release.tag_name,
                                  );
                                }}
                              >
                                {fetchTag.isPending
                                  ? t("tag.fetching")
                                  : t("tag.fetch", {
                                      tag: entry.release.tag_name,
                                    })}
                              </button>
                            )}
                        </div>
                        {selectedReleaseId === entry.release.id && (
                          <div
                            id={`release-assets-${entry.release.id}`}
                            className="tags-releases-panel__assets"
                          >
                            <h4>{t("assets.title")}</h4>
                            {assets.isLoading && (
                              <p role="status">{t("assets.loading")}</p>
                            )}
                            {assets.isError && (
                              <div role="alert">
                                <ErrorMessage error={assets.error} />
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
                              </div>
                            )}
                            {assets.data != null && (
                              <>
                                {assets.data.assets.length === 0 ? (
                                  <p role="status">{t("assets.empty")}</p>
                                ) : (
                                  <ul className="tags-releases-panel__asset-list">
                                    {assets.data.assets.map((asset) => {
                                      const transfer = [...transfers]
                                        .reverse()
                                        .find(
                                          (candidate) =>
                                            candidate.releaseId ===
                                              entry.release.id &&
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
                                        <li
                                          className="tags-releases-panel__asset"
                                          key={asset.id}
                                        >
                                          <span className="tags-releases-panel__asset-name">
                                            {asset.name}
                                          </span>
                                          <span className="tags-releases-panel__asset-size">
                                            {t("assets.size", {
                                              bytes: asset.size,
                                            })}
                                          </span>
                                          {transfer !== undefined && (
                                            <div
                                              className="tags-releases-panel__transfer"
                                              role="status"
                                              aria-live="polite"
                                            >
                                              <span>
                                                {t(
                                                  `transfer.${transfer.status}`,
                                                )}
                                                {transfer.status ===
                                                  "downloading" &&
                                                  ` · ${t("transfer.bytes", {
                                                    downloaded:
                                                      transfer.downloadedBytes,
                                                    total:
                                                      transfer.totalBytes ??
                                                      "?",
                                                  })}`}
                                              </span>
                                              {progress !== null && (
                                                <progress
                                                  max={progress.total}
                                                  value={progress.downloaded}
                                                  aria-label={t(
                                                    "transfer.progressLabel",
                                                    {
                                                      asset: asset.name,
                                                    },
                                                  )}
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
                                            <ErrorMessage
                                              error={download.error}
                                            />
                                          )}
                                          <div className="tags-releases-panel__asset-actions">
                                            <button
                                              type="button"
                                              className="button"
                                              disabled={
                                                download.isPending ||
                                                pendingAction !== null ||
                                                !panelActive ||
                                                activeTransfer
                                              }
                                              onClick={() => {
                                                void downloadAsset(
                                                  entry.release.id,
                                                  asset,
                                                );
                                              }}
                                            >
                                              {t("assets.download")}
                                            </button>
                                            {(transfer?.status === "starting" ||
                                              transfer?.status ===
                                                "downloading") && (
                                              <button
                                                type="button"
                                                className="button"
                                                disabled={
                                                  cancelTransfer.isPending
                                                }
                                                onClick={() => {
                                                  void cancel(
                                                    transfer.transferId,
                                                  );
                                                }}
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
                                  <p role="status">{t("assets.truncated")}</p>
                                )}
                              </>
                            )}
                          </div>
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
          {cancelError !== null && <ErrorMessage error={cancelError} />}
          {resumeError !== null && <ErrorMessage error={resumeError} />}
          {accessChallenge && (
            <section
              className="tags-releases-panel__access"
              aria-label={t("access.title")}
            >
              <p role="status">
                {downloadNeedsRetry
                  ? t("access.downloadRetry")
                  : pendingAction === null
                    ? t("access.requiredNoPending")
                    : t("access.required")}
              </p>
              <label htmlFor="release-access-token">
                {t("access.tokenLabel")}
              </label>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveTokenAndResume();
                }}
              >
                <input
                  id="release-access-token"
                  type="password"
                  autoComplete="off"
                  value={token}
                  onChange={(event) => {
                    setToken(event.currentTarget.value);
                  }}
                />
                <button
                  type="submit"
                  className="button button--primary"
                  disabled={token.trim() === "" || savingToken}
                >
                  {savingToken ? t("access.saving") : t("access.save")}
                </button>
              </form>
              {tokenError !== null && (
                <div role="alert">
                  <ErrorMessage error={tokenError} />
                </div>
              )}
            </section>
          )}
          {downloadNeedsRetry && downloadTokenSaved && (
            <p className="tags-releases-panel__notice" role="status">
              {t("access.retryDownload")}
            </p>
          )}
          {manualRetryReady && !downloadNeedsRetry && (
            <p className="tags-releases-panel__notice" role="status">
              {t("access.retryAction")}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
