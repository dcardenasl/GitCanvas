import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { MenuLabels } from "../bindings";
import { isMacPlatform } from "../lib/platform";
import { onMenuAction, setMenuLabels } from "../lib/ipc";
import { closeActiveTab } from "./tabCommands";

/** What the shell needs to show about the menu bar's state. */
export interface NativeMenu {
  /** Why the menu bar could not be set up, or `null`. */
  readonly error: unknown;
  /** Sets it up again after a failure. */
  readonly retry: () => void;
}

/**
 * Keeps the macOS menu bar in the interface language, and carries out its items.
 *
 * The menu bar's text comes from the same catalogs as everything else and is
 * sent again whenever the language changes, so a switch is as immediate there
 * as in the window. Choosing an item runs the same action the keyboard would.
 * Elsewhere there is no menu bar, nothing is sent, and the page's own shortcuts
 * do the work.
 *
 * @param openFolder - Asks for a folder to open as a project.
 */
export function useNativeMenu(openFolder: () => void): NativeMenu {
  const { t } = useTranslation("menu");
  const [failure, setFailure] = useState<{ readonly error: unknown } | null>(
    null,
  );
  const [retryToken, setRetryToken] = useState(0);

  const labels = useMemo<MenuLabels>(
    () => ({
      about: t("about"),
      hide: t("hide"),
      hide_others: t("hideOthers"),
      show_all: t("showAll"),
      quit: t("quit"),
      file: t("file"),
      open_folder: t("openFolder"),
      close_tab: t("closeTab"),
      edit: t("edit"),
      undo: t("undo"),
      redo: t("redo"),
      cut: t("cut"),
      copy: t("copy"),
      paste: t("paste"),
      select_all: t("selectAll"),
      window: t("window"),
      minimize: t("minimize"),
      zoom: t("zoom"),
    }),
    [t],
  );

  // The last request wins: a language changed twice quickly must not end with
  // the first one's text because its answer arrived last.
  const latest = useRef(0);
  useEffect(() => {
    if (!isMacPlatform()) return;
    const request = latest.current + 1;
    latest.current = request;
    void setMenuLabels(labels).then(
      () => {
        if (latest.current === request) setFailure(null);
      },
      (error: unknown) => {
        if (latest.current === request) setFailure({ error });
      },
    );
  }, [labels, retryToken]);

  const openFolderRef = useRef(openFolder);
  useEffect(() => {
    openFolderRef.current = openFolder;
  });
  useEffect(() => {
    const listening = onMenuAction(({ payload }) => {
      if (payload.action === "OpenFolder") openFolderRef.current();
      else closeActiveTab();
    });
    return () => {
      void listening.then((stop) => {
        stop();
      });
    };
  }, []);

  return {
    error: failure === null ? null : failure.error,
    retry: () => {
      setRetryToken((token) => token + 1);
    },
  };
}
