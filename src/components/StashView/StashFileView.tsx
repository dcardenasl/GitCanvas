import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { StashView, StashReading } from "../../state/stashNavigation";
import { useNavigationActions } from "../../state/workspace";
import { getStashFileContent, getStashFileDiff } from "../../lib/ipc";
import { queryKeys } from "../../state/queryKeys";
import { DiffViewer } from "../DiffViewer";
import { WholeFilePreview } from "../FileDiffView/WholeFilePreview";
import { ErrorMessage } from "../ErrorMessage";
import { focusStashControl } from "./metadata";
import "../FileDiffView/FileDiffView.css";

/** Reads exact immutable versions, with no current-HEAD or working-tree queries. */
export function StashFileView({
  root,
  view,
}: {
  readonly root: string;
  readonly view: StashView;
}) {
  const { t } = useTranslation(["stash", "common"]);
  const { updateStash } = useNavigationActions();
  const [wrap, setWrap] = useState(true);
  const id = view.entry.stash_id;
  const selected = view.file;
  const key = selected?.key ?? "";
  const ready = selected !== null && view.fileMode === view.mode;
  const request = { stash_id: id, mode: view.mode, file_key: key };
  const diff = useQuery({
    queryKey: queryKeys.stashDiff(root, id, view.mode, key, view.expanded),
    enabled: ready && view.reading === "diff",
    queryFn: () =>
      getStashFileDiff(root, { file: request, expand: view.expanded }),
    staleTime: Infinity,
  });
  const side = view.reading === "previous" ? "previous" : "saved";
  const whole = useQuery({
    queryKey: queryKeys.stashContent(
      root,
      id,
      view.mode,
      key,
      side,
      view.expanded,
    ),
    enabled: ready && view.reading !== "diff",
    queryFn: () =>
      getStashFileContent(root, { file: request, side, expand: view.expanded }),
    staleTime: Infinity,
  });
  const current = view.reading === "diff" ? diff : whole;
  const expand = () => {
    updateStash(id, (state) => ({ ...state, expanded: true }));
  };
  const back = () => {
    updateStash(id, (state) => ({ ...state, center: "graph" }));
    focusStashControl("[data-stash-close]");
  };
  const path = selected?.file.path ?? "";
  return (
    <section className="file-diff" aria-label={path}>
      <header className="file-diff__head">
        <button
          className="file-diff__back"
          type="button"
          data-stash-back
          onClick={back}
        >
          {t("back")}
        </button>
        <div className="file-diff__title">
          <span className="file-diff__path" title={path}>
            {selected?.file.old_path !== null &&
            selected?.file.old_path !== undefined
              ? `${selected.file.old_path} → ${path}`
              : path}
          </span>
          <span className="file-diff__commit">
            {id.slice(0, 12)} · {t(view.mode)} · {t("readonly")}
          </span>
        </div>
        <div className="file-diff__controls">
          <div className="segmented" role="group" aria-label={t("reading")}>
            {(["diff", "previous", "saved"] as const).map(
              (reading: StashReading) => (
                <button
                  type="button"
                  className="segmented__option"
                  key={reading}
                  aria-pressed={view.reading === reading}
                  disabled={
                    !ready ||
                    (reading === "previous" && selected.previous === null) ||
                    (reading === "saved" && selected.saved === null)
                  }
                  onClick={() => {
                    updateStash(id, (state) => ({
                      ...state,
                      reading,
                      expanded: false,
                    }));
                  }}
                >
                  {t(reading)}
                </button>
              ),
            )}
          </div>
          <button
            type="button"
            className="button"
            aria-pressed={wrap}
            onClick={() => {
              setWrap(!wrap);
            }}
          >
            {t("wrap")}
          </button>
        </div>
      </header>
      <div className="file-diff__body">
        {(selected?.previous?.path_lossy === true ||
          selected?.saved?.path_lossy === true) && (
          <p className="diff-viewer__notice">{t("lossy")}</p>
        )}
        {(!ready || current.isPending) && (
          <p className="state" role="status">
            {t("loading")}
          </p>
        )}
        {ready && current.error !== null && (
          <div className="state" role="alert">
            <p>{t("unavailable")}</p>
            <ErrorMessage error={current.error} />
            <button
              type="button"
              className="button"
              onClick={() => {
                void current.refetch();
              }}
            >
              {t("common:actions.retry")}
            </button>
          </div>
        )}
        {ready &&
          view.reading === "diff" &&
          diff.data !== undefined &&
          (diff.data.entry.preview_unavailable !== null ? (
            <p className="diff-viewer__notice">
              {t(diff.data.entry.preview_unavailable)}
            </p>
          ) : (
            <DiffViewer
              file={{ ...diff.data.entry.file, patch: diff.data.patch }}
              wrap={wrap}
              expanding={diff.isFetching}
              onExpand={expand}
            />
          ))}
        {ready && view.reading !== "diff" && whole.data !== undefined && (
          <>
            {whole.data.version !== null && (
              <p className="diff-viewer__notice">
                {t("sourcePath", { path: whole.data.version.path })} ·{" "}
                <code>{whole.data.version.commit_id.slice(0, 12)}</code>
                {whole.data.version.path_lossy && <> · {t("lossy")}</>}
              </p>
            )}
            {whole.data.outcome.kind === "available" ? (
              <WholeFilePreview
                content={whole.data.outcome.content}
                path={whole.data.version?.path ?? path}
                wrap={wrap}
                expanded={view.expanded}
                fetching={whole.isFetching}
                onExpand={expand}
              />
            ) : (
              <p className="diff-viewer__notice">
                {t(whole.data.outcome.reason)}
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
