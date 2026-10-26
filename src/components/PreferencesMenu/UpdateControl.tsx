import { useEffect, useState } from "react";
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

/** Offers a signed, verified release update from the configured Tauri endpoint. */
export function UpdateControl() {
  const { t } = useTranslation("shell");
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [update, setUpdate] = useState<Update | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  useEffect(
    () => () => {
      if (update) void update.close();
    },
    [update],
  );

  if (!isTauri()) return null;

  async function checkForUpdates() {
    setStatus("checking");
    setProgress(null);
    try {
      const nextUpdate = await check();
      setUpdate(nextUpdate);
      setStatus(nextUpdate ? "available" : "current");
    } catch {
      setStatus("error");
    }
  }

  async function installUpdate() {
    if (!update) return;
    setStatus("installing");
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
      setStatus("error");
    }
  }

  const message =
    status === "checking"
      ? t("updates.checking")
      : status === "current"
        ? t("updates.current")
        : status === "available"
          ? t("updates.available", { version: update?.version })
          : status === "installing"
            ? t("updates.installing", {
                progress: progress === null ? "" : ` ${String(progress)}%`,
              })
            : status === "error"
              ? t("updates.error")
              : "";

  return (
    <div className="update-control" aria-live="polite">
      <span className="update-control__status">{message}</span>
      {status === "available" ? (
        <button
          className="button update-control__action"
          type="button"
          onClick={() => void installUpdate()}
        >
          {t("updates.install")}
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
    </div>
  );
}
