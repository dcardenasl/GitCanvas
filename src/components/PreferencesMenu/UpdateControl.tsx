import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { isTauri } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";
import {
  check,
  type DownloadEvent,
  type Update,
} from "@tauri-apps/plugin-updater";
import { useTranslation } from "react-i18next";

type UpdateStatus =
  "idle" | "checking" | "current" | "available" | "installing" | "error";
type FailureStage = "checking" | "installing";
type VersionStatus = "loading" | "loaded" | "unavailable";

/** Offers a signed, verified release update from the configured Tauri endpoint. */
export function UpdateControl() {
  const { t } = useTranslation("shell");
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [update, setUpdate] = useState<Update | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [installedVersion, setInstalledVersion] = useState<string | null>(null);
  const [versionStatus, setVersionStatus] = useState<VersionStatus>("loading");
  const [failureStage, setFailureStage] = useState<FailureStage | null>(null);

  useEffect(() => {
    if (!isTauri()) return;

    let active = true;
    void getVersion()
      .then((version) => {
        if (active) {
          setInstalledVersion(version);
          setVersionStatus("loaded");
        }
      })
      .catch(() => {
        if (active) setVersionStatus("unavailable");
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(
    () => () => {
      if (update) void update.close();
    },
    [update],
  );

  if (!isTauri()) return null;

  async function checkForUpdates() {
    setStatus("checking");
    setFailureStage(null);
    setProgress(null);
    try {
      const nextUpdate = await check();
      setUpdate(nextUpdate);
      setStatus(nextUpdate ? "available" : "current");
    } catch {
      setFailureStage("checking");
      setStatus("error");
    }
  }

  async function installUpdate() {
    if (!update) return;
    setStatus("installing");
    setFailureStage(null);
    setProgress(0);
    let downloaded = 0;
    let contentLength: number | undefined;
    try {
      await update.downloadAndInstall((event: DownloadEvent) => {
        if (event.event === "Started") {
          contentLength = event.data.contentLength;
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          setProgress(
            contentLength && contentLength > 0
              ? Math.min(100, Math.round((downloaded / contentLength) * 100))
              : null,
          );
        }
      });
      await relaunch();
    } catch {
      setFailureStage("installing");
      setStatus("error");
    }
  }

  const message =
    status === "checking"
      ? t("updates.checking")
      : status === "current"
        ? t("updates.current", {
            version: installedVersion ?? t("updates.versionUnavailable"),
          })
        : status === "available"
          ? t("updates.available", { version: update?.version })
          : status === "installing"
            ? t("updates.installing", {
                progress: progress === null ? "" : ` ${String(progress)}%`,
              })
            : status === "error"
              ? t(
                  failureStage === "installing"
                    ? "updates.installError"
                    : "updates.checkError",
                )
              : "";

  return (
    <section className="update-control" aria-label={t("updates.title")}>
      <h2 className="update-control__title">{t("updates.title")}</h2>
      <div className="update-control__version">
        <span>{t("updates.installedVersion")}</span>
        <code>
          {installedVersion ??
            t(
              versionStatus === "loading"
                ? "updates.versionLoading"
                : "updates.versionUnavailable",
            )}
        </code>
      </div>
      <p
        className="update-control__status"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-state={status}
      >
        {message}
      </p>
      {status === "available" && update?.body ? (
        <p className="update-control__notes">{update.body}</p>
      ) : null}
      {status === "available" ? (
        <p className="update-control__restart-note">
          {t("updates.restartNote")}
        </p>
      ) : null}
      {status === "available" ? (
        <button
          className="button update-control__action"
          type="button"
          onClick={() => void installUpdate()}
        >
          {t("updates.downloadInstall")}
        </button>
      ) : (
        <button
          className="button update-control__action"
          type="button"
          disabled={status === "checking" || status === "installing"}
          onClick={() => void checkForUpdates()}
        >
          {status === "error" ? t("updates.retry") : t("updates.check")}
        </button>
      )}
    </section>
  );
}
