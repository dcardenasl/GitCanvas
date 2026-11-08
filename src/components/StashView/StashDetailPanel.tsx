import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { StashComparisonMode } from "../../bindings";
import type { StashView } from "../../state/stashNavigation";
import { useStashFiles } from "../../state/stashes";
import { useNavigationActions } from "../../state/workspace";
import { ChangedFilesBrowser } from "../ChangedFilesBrowser/ChangedFilesBrowser";
import { ErrorMessage } from "../ErrorMessage";
import { focusStashControl, stashDate } from "./metadata";
import "./StashView.css";

const MODES: readonly StashComparisonMode[] = [
  "all",
  "staged",
  "unstaged",
  "untracked",
];

/** Saved-state metadata and the existing changed-file browser, with exact delta keys. */
export function StashDetailPanel({
  root,
  view,
}: {
  readonly root: string;
  readonly view: StashView;
}) {
  const { t } = useTranslation(["stash", "common"]);
  const { closeStash, updateStash } = useNavigationActions();
  const id = view.entry.stash_id;
  const query = useStashFiles(root, id, view.mode);
  const first = query.data?.pages[0];
  const files = query.data?.pages.flatMap((page) => page.files) ?? [];
  // A new comparison issues different keys. Retain by exact saved path+origin,
  // only after the whole page sequence proves membership or absence.
  useEffect(() => {
    if (query.data === undefined || query.error !== null) return;
    const loaded = query.data.pages.flatMap((page) => page.files);
    updateStash(id, (current) => {
      if (current.mode !== view.mode || current.file === null) return current;
      if (loaded.some((file) => file.key === current.file?.key)) return current;
      const prior = current.file;
      const replacement = loaded.find(
        (file) => file.path_identity === prior.path_identity,
      );
      if (replacement === undefined && query.hasNextPage) return current;
      return replacement === undefined
        ? {
            ...current,
            file: null,
            center: "choose_file",
            reading: "diff",
            expanded: false,
          }
        : { ...current, file: replacement, fileMode: current.mode };
    });
  }, [id, query.data, query.hasNextPage, query.error, updateStash, view.mode]);
  // Resolve retention beyond the first page; never infer absence from a partial page.
  useEffect(() => {
    if (
      view.file !== null &&
      query.hasNextPage &&
      !query.isFetching &&
      query.error === null &&
      !query.data?.pages.some((page) =>
        page.files.some((file) => file.key === view.file?.key),
      )
    ) {
      void query.fetchNextPage();
    }
  }, [view.file, query]);
  const close = () => {
    closeStash();
    focusStashControl(`[data-stash-row="${id}"]`);
  };
  return (
    <aside className="detail-panel stash-detail" aria-label={t("title")}>
      <header className="stash-detail__header">
        <span className="stash-detail__readonly">{t("readonly")}</span>
        <button
          type="button"
          className="button"
          data-stash-close
          onClick={close}
        >
          {t("close")}
        </button>
      </header>
      <h2 className="stash-detail__title">
        {view.removed ? id.slice(0, 12) : `stash@{${String(view.entry.index)}}`}
      </h2>
      <p className="stash-detail__message">
        {view.entry.message ?? t("noMessage")}
      </p>
      <dl className="stash-detail__metadata">
        <dt>{t("recorded")}</dt>
        <dd>{stashDate(view.entry) ?? t("dateInvalid")}</dd>
        <dt>{t("base")}</dt>
        <dd>
          {view.entry.branch.kind === "named"
            ? view.entry.branch.name
            : t(view.entry.branch.kind)}
          {first !== undefined && (
            <>
              {" "}
              ·{" "}
              <code title={first.inspection.base_commit_id}>
                {first.inspection.base_commit_id.slice(0, 12)}
              </code>
            </>
          )}
        </dd>
      </dl>
      {view.removed && (
        <p className="stash-detail__notice" role="status">
          {t("removed")}
        </p>
      )}
      {view.entry.message_lossy && (
        <p className="stash-detail__notice">{t("lossy")}</p>
      )}
      <div
        className="stash-detail__modes"
        role="group"
        aria-label={t("modeLabel")}
      >
        {MODES.map((mode) => (
          <button
            type="button"
            className="segmented__option"
            key={mode}
            aria-pressed={mode === view.mode}
            onClick={() => {
              updateStash(id, (current) =>
                current.mode === mode
                  ? current
                  : { ...current, mode, reading: "diff", expanded: false },
              );
            }}
          >
            {t(mode)}
          </button>
        ))}
      </div>
      <p className="stash-detail__hint">{t("net")}</p>
      {first !== undefined && (
        <p className="stash-detail__count" role="status">
          {t("filesCount", { count: first.total_files })}
        </p>
      )}
      {first?.inspection.notices.map((notice) => (
        <p className="stash-detail__notice" key={notice}>
          {t(notice)}
        </p>
      ))}
      {query.isPending && <p role="status">{t("loading")}</p>}
      {query.error !== null && (
        <div role="alert">
          <ErrorMessage error={query.error} lead={t("readFailed")} />
          <button
            className="button"
            type="button"
            onClick={() => {
              void query.refetch();
            }}
          >
            {t("common:actions.retry")}
          </button>
        </div>
      )}
      {first?.total_files === 0 && (
        <p role="status" className="stash-detail__hint">
          {t("emptyMode")}
        </p>
      )}
      <ChangedFilesBrowser
        folders={{
          collapsed: view.collapsedFolders,
          set: (paths) => {
            updateStash(id, (current) => ({
              ...current,
              collapsedFolders: new Set(paths),
            }));
          },
          toggle: (path) => {
            updateStash(id, (current) => {
              const collapsedFolders = new Set(current.collapsedFolders);
              if (!collapsedFolders.delete(path)) collapsedFolders.add(path);
              return { ...current, collapsedFolders };
            });
          },
        }}
        groups={(["tracked", "untracked"] as const).map((origin) => ({
          source: "stash" as const,
          files: files
            .filter((file) => file.origin === origin)
            .map((file) => ({
              ...file.file,
              key: file.key,
              statsAvailable: file.stats_available,
            })),
          listLabel: t(origin === "tracked" ? "tracked" : "savedUntracked"),
          sectionLabel: t(origin === "tracked" ? "tracked" : "savedUntracked"),
          heading: files.some((file) => file.origin === origin) ? (
            <h3>{t(origin === "tracked" ? "tracked" : "savedUntracked")}</h3>
          ) : undefined,
        }))}
        selectedFilePath={view.file?.key ?? null}
        selectedFileSource="stash"
        onOpen={(_path, _source, _snapshot, key) => {
          const file = files.find((entry) => entry.key === key);
          if (file !== undefined) {
            updateStash(id, (current) => ({
              ...current,
              file,
              fileMode: current.mode,
              center: "file",
              reading: "diff",
              expanded: false,
            }));
            focusStashControl("[data-stash-back]");
          }
        }}
      />
      {query.hasNextPage && (
        <button
          className="button"
          type="button"
          disabled={query.isFetching}
          onClick={() => {
            void query.fetchNextPage();
          }}
        >
          {t("more")}
        </button>
      )}
    </aside>
  );
}
