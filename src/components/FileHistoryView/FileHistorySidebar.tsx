import { useVirtualizer } from "@tanstack/react-virtual";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useTranslation } from "react-i18next";

import type { FileHistoryRow } from "../../bindings";
import { ROW_HEIGHT } from "../../lib/historyGeometry";
import { useFileHistory } from "../../state/fileHistory";
import { useRepositoryRefs } from "../../state/refs";
import {
  useActiveRepository,
  useNavigation,
  useNavigationActions,
} from "../../state/workspace";
import { useWorktreeSnapshot } from "../../state/worktree";
import { ChangeMark } from "../ChangeMark";
import {
  authorInitials,
  formatCommitTime,
  shortId,
} from "../CommitTable/format";
import { ErrorMessage } from "../ErrorMessage";

import "./FileHistoryView.css";

/** Rows moved by Page Up and Page Down. */
const PAGE_ROWS = 10;

/**
 * The row that a navigation key moves to from `index`, or `null` for other keys.
 * Movement stops at the first and last rows rather than wrapping.
 */
function keyTarget(key: string, index: number, last: number): number | null {
  switch (key) {
    case "ArrowDown":
      return Math.min(index + 1, last);
    case "ArrowUp":
      return Math.max(index - 1, 0);
    case "PageDown":
      return Math.min(index + PAGE_ROWS, last);
    case "PageUp":
      return Math.max(index - PAGE_ROWS, 0);
    case "Home":
      return 0;
    case "End":
      return last;
    default:
      return null;
  }
}

/** The row index of the element that holds focus, when it is a history row. */
function rowIndexOf(target: EventTarget): number | null {
  if (!(target instanceof HTMLElement)) return null;
  const value =
    target.closest<HTMLElement>("[data-row-index]")?.dataset.rowIndex;
  return value === undefined ? null : Number(value);
}

/**
 * The commits that changed the open file, listed where the branch list usually
 * is. Moving through the list selects a commit, and the centre shows that
 * commit's change to the file.
 */
export function FileHistorySidebar() {
  const { t } = useTranslation(["fileHistory", "common"]);
  const root = useActiveRepository()?.path ?? null;
  const view = useNavigation((navigation) => navigation.fileHistory);
  const actions = useNavigationActions();
  const head = useRepositoryRefs(root).data?.head ?? null;
  const localFiles = useWorktreeSnapshot(root).data;
  const file = useFileHistory(root, view);
  const scrollRef = useRef<HTMLDivElement>(null);
  // The virtualizer keeps mutable internal state that the React Compiler
  // cannot reason about, so it flags the call. That is inherent to the library.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: file.rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  });

  // Focus moves one row at a time. The row it moves to may not be drawn yet, so
  // the request waits until the virtualizer has rendered that row.
  const [focusRequest, setFocusRequest] = useState<number | null>(null);
  const virtualRows = virtualizer.getVirtualItems();
  useEffect(() => {
    if (focusRequest === null) return;
    const row = scrollRef.current?.querySelector<HTMLButtonElement>(
      `[data-row-index="${String(focusRequest)}"]`,
    );
    if (row === null || row === undefined) return;
    row.focus();
    setFocusRequest(null);
  }, [focusRequest, virtualRows]);

  // Moving the focus also selects the commit, so the centre follows the keyboard.
  const onListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = rowIndexOf(event.target);
    if (index === null) return;
    const target = keyTarget(event.key, index, file.rows.length - 1);
    if (target === null) return;
    const row = file.rows[target];
    if (row === undefined) return;
    event.preventDefault();
    virtualizer.scrollToIndex(target);
    actions.selectFileHistoryRow(row.commit.id);
    setFocusRequest(target);
  };

  // A view that started from HEAD is stale once HEAD moves away from its start.
  const followsHead = view?.followsHead ?? false;
  const startCommitId = view?.startCommitId ?? null;
  useEffect(() => {
    if (followsHead && head !== null) {
      actions.setFileHistoryStale(head !== startCommitId);
    }
  }, [actions, followsHead, head, startCommitId]);

  // A pick survives a refresh only when the complete new history still lists it.
  const listed = useMemo(
    () => new Set(file.rows.map((row) => row.commit.id)),
    [file.rows],
  );
  const complete =
    !file.isLoading &&
    !file.hasNextPage &&
    file.truncation === null &&
    file.error === null;
  useEffect(() => {
    if (complete) actions.retainFileHistorySelection(listed);
  }, [actions, complete, listed]);

  // Escape returns to the graph. An open menu closes first, because it also listens.
  const open = view !== null;
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (document.querySelector('[role="menu"]') !== null) return;
      actions.closeFileHistory();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [actions, open]);

  if (root === null || view === null) return null;

  // The centre shows the picked commit, or the newest one when nothing is picked.
  const shownId = view.selectedCommitId ?? file.rows[0]?.commit.id ?? null;
  const localSide =
    localFiles === undefined
      ? null
      : localFiles.unstaged.files.some((entry) => entry.path === view.path)
        ? "unstaged"
        : localFiles.staged.files.some((entry) => entry.path === view.path)
          ? "staged"
          : null;

  /** What a row says beyond its summary: a rename, a merge, or a lineage that stopped. */
  const rowNotes = (row: FileHistoryRow): string[] => {
    const notes: string[] = [];
    if (row.renamed_from !== null) {
      notes.push(t("renamedFrom", { path: row.renamed_from }));
    }
    if (row.is_merge) notes.push(t("merge"));
    // Only rename limits end a lineage on a row; page bounds never appear here.
    if (
      row.lineage === "rename_limit" ||
      row.lineage === "rename_search_skipped"
    ) {
      notes.push(t(`lineage.${row.lineage}`));
    }
    return notes;
  };

  return (
    <aside
      className="file-history"
      aria-label={t("title", { path: view.path })}
    >
      <header className="file-history__header">
        <div className="file-history__nav">
          <button
            type="button"
            className="file-history__back"
            title={t("backHint")}
            onClick={() => {
              actions.closeFileHistory();
            }}
          >
            {t("back")}
          </button>
          {localSide !== null && (
            <button
              type="button"
              className="file-history__local"
              onClick={() => {
                actions.closeFileHistory();
                actions.selectFile(view.path, localSide);
              }}
            >
              {t("localChanges")}
            </button>
          )}
        </div>
        <p className="file-history__path" title={view.path}>
          {view.path}
        </p>
      </header>

      {view.stale && head !== null && (
        <div className="file-history__notice" role="status">
          <span>{t("stale")}</span>
          <button
            type="button"
            className="button"
            onClick={() => {
              actions.refreshFileHistory(head);
            }}
          >
            {t("refresh")}
          </button>
        </div>
      )}
      {file.shallow && (
        <p className="file-history__notice" role="note">
          {t("shallow")}
        </p>
      )}
      {file.truncation === "frontier_limit" && (
        <p className="file-history__notice" role="note">
          {t("truncation.frontier_limit")}
        </p>
      )}
      {file.truncation === "work_limit" && (
        <p className="file-history__notice" role="note">
          {t("truncation.work_limit")}
        </p>
      )}
      {file.error !== null && (
        <div className="file-history__notice" role="alert">
          <ErrorMessage error={file.error} />
          <button type="button" className="button" onClick={file.retry}>
            {t("common:actions.retry")}
          </button>
        </div>
      )}

      {file.isLoading ? (
        <p className="state" role="status">
          {t("loading")}
        </p>
      ) : file.rows.length === 0 && file.error === null ? (
        <p className="state">{t("empty")}</p>
      ) : (
        <div
          ref={scrollRef}
          className="file-history__list"
          onKeyDown={onListKeyDown}
        >
          <ul
            className="file-history__rows"
            aria-label={t("list", { path: view.path })}
            style={{ height: virtualizer.getTotalSize() }}
          >
            {virtualRows.map((item) => {
              const row = file.rows[item.index];
              if (row === undefined) return null;
              const selected = shownId === row.commit.id;
              return (
                <li
                  key={row.commit.id}
                  className="file-history__item"
                  style={{
                    height: ROW_HEIGHT,
                    transform: `translateY(${String(item.start)}px)`,
                  }}
                >
                  <button
                    type="button"
                    data-row-index={item.index}
                    className={
                      selected
                        ? "file-history__row file-history__row--selected"
                        : "file-history__row"
                    }
                    aria-pressed={selected}
                    onClick={() => {
                      actions.selectFileHistoryRow(row.commit.id);
                    }}
                  >
                    <ChangeMark
                      kind={row.change}
                      label={t(`change.${row.change}`)}
                    />
                    <span className="file-history__summary">
                      {row.commit.summary}
                    </span>
                    <span className="file-history__meta">
                      <span className="file-history__avatar" aria-hidden="true">
                        {authorInitials(row.commit.author_name)}
                      </span>
                      <span className="file-history__author">
                        {row.commit.author_name}
                      </span>
                      <time className="file-history__date">
                        {formatCommitTime(row.commit.commit_time)}
                      </time>
                      <span className="file-history__id">
                        {shortId(row.commit.id)}
                      </span>
                      {rowNotes(row).map((note) => (
                        <span key={note} className="file-history__chip">
                          {note}
                        </span>
                      ))}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {file.hasNextPage && (
            <button
              type="button"
              className="button file-history__more"
              disabled={file.isFetchingNextPage}
              onClick={file.fetchNextPage}
            >
              {t("loadMore")}
            </button>
          )}
        </div>
      )}
    </aside>
  );
}
