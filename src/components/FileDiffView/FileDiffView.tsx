import { WholeFilePreview } from "./WholeFilePreview";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type {
  CommitInfo,
  FileContent,
  WorktreeFileContent,
} from "../../bindings";
import { errorKind } from "../../lib/errors";
import { getFileContent, getWorktreeFileContent } from "../../lib/ipc";
import { useCommitDiff } from "../../state/diff";
import { fileHistoryUnavailable } from "../../state/fileHistory";
import { useRepositoryRefs } from "../../state/refs";
import { useNavigation, useNavigationActions } from "../../state/workspace";
import { useWorktreeFileDiff, useWorktreeSnapshot } from "../../state/worktree";
import { queryKeys } from "../../state/queryKeys";
import { shortId } from "../CommitTable/format";
import { DiffViewer } from "../DiffViewer";
import { DiffStat } from "../DiffStat/DiffStat";
import { ErrorMessage } from "../ErrorMessage";

import "./FileDiffView.css";

interface SharedProps {
  readonly repositoryPath: string;
  readonly path: string;
  /**
   * Rendered inside another view that owns navigation, such as a file's history:
   * this view then has no back action and leaves Escape to its owner.
   */
  readonly embedded?: boolean | undefined;
  /** Extra actions shown with the view controls, supplied by the owning view. */
  readonly actions?: ReactNode | undefined;
}

/** Source-specific inputs for a commit or local worktree file view. */
export type FileDiffViewProps =
  | (SharedProps & {
      readonly commit: CommitInfo;
      readonly worktree?: never;
      readonly snapshot?: boolean;
    })
  | (SharedProps & {
      readonly commit?: never;
      readonly worktree: { readonly side: "staged" | "unstaged" };
      readonly snapshot?: never;
    });

type Mode = "diff" | "file";

/** One commit or one local file, with an impossible-to-confuse source. */
export function FileDiffView(props: FileDiffViewProps) {
  const { t } = useTranslation(["files", "common", "fileHistory"]);
  const { repositoryPath, path } = props;
  const embedded = props.embedded === true;

  const { selectFile, expandFile, openFileHistory } = useNavigationActions();
  const expandPath = useNavigation((navigation) => navigation.expandedFilePath);
  const [wrap, setWrap] = useState(true);
  const [choice, setChoice] = useState<{
    key: string;
    mode: Mode;
  }>({ key: "", mode: "diff" });

  const isWorktree = props.worktree !== undefined;
  const isSnapshot = !isWorktree && props.snapshot === true;
  // A file's history starts where this diff reads: its commit, or HEAD for local changes.
  const head = useRepositoryRefs(isWorktree ? repositoryPath : null).data?.head;
  const historyStart = isWorktree ? (head ?? null) : props.commit.id;
  const historyUnavailable = fileHistoryUnavailable(path, historyStart);
  const sourceKey = isWorktree
    ? props.worktree.side
    : `commit-${props.commit.id}`;
  const key = `${sourceKey}/${path}`;
  const mode: Mode = isSnapshot
    ? "file"
    : choice.key === key
      ? choice.mode
      : "diff";
  const expanded = expandPath === path;

  const commitDiff = useCommitDiff(
    repositoryPath,
    isWorktree ? null : props.commit.id,
    expandPath === path ? expandPath : null,
    isWorktree || isSnapshot ? null : path,
  );
  const localSnapshot = useWorktreeSnapshot(isWorktree ? repositoryPath : null);
  const localRevision = localSnapshot.data?.revision;
  const worktreeFileDiff = useWorktreeFileDiff(
    repositoryPath,
    isWorktree && localRevision !== undefined
      ? {
          side: props.worktree.side,
          path,
          expected_revision: localRevision,
          expand: expanded,
        }
      : null,
  );
  const diff = isWorktree ? worktreeFileDiff : commitDiff;
  const file = isWorktree
    ? worktreeFileDiff.data?.file
    : commitDiff.data?.files.find((entry) => entry.path === path);
  const deleted = file?.change === "Deleted";
  // A commit that deleted a file has no content of its own. Its previous version
  // is the file at the first parent, which the whole-file view shows instead.
  const previousCommitId = deleted ? (props.commit?.parents[0] ?? null) : null;

  useEffect(() => {
    if (
      isSnapshot &&
      commitDiff.data?.files.some((entry) => entry.path === path) === true
    ) {
      // The file tree can be opened while the changed-file diff is still
      // loading. Once it arrives, changed files always use their patch view.
      selectFile(path, "commit", "diff");
    }
  }, [commitDiff.data, isSnapshot, path, selectFile]);

  const whole = useQuery<FileContent | WorktreeFileContent>({
    queryKey: queryKeys.file(
      repositoryPath,
      isWorktree
        ? { kind: "worktree", side: props.worktree.side }
        : { kind: "commit", commitId: props.commit.id },
      path,
      expanded,
      localRevision,
    ),
    enabled:
      mode === "file" &&
      (!deleted || previousCommitId !== null) &&
      (!isWorktree || localRevision !== undefined),
    queryFn: () => {
      if (isWorktree) {
        return getWorktreeFileContent(repositoryPath, {
          side: props.worktree.side,
          path,
          expected_revision: localRevision ?? null,
          expand: expanded,
        });
      }
      return getFileContent(repositoryPath, {
        commit_id: previousCommitId ?? props.commit.id,
        path,
        expand: expanded,
      });
    },
    staleTime: isWorktree ? 1_000 : Infinity,
  });

  const refetchLocalSnapshot = localSnapshot.refetch;
  useEffect(() => {
    if (!isWorktree) return;
    const failure = diff.error ?? whole.error;
    if (failure === null) return;

    // A read is tied to the revision it was asked for, so editing the file
    // while it is open makes that read fail as stale. The file is still there:
    // take the new revision and read again instead of closing what the user is
    // looking at. Other failures stay visible in the selected file view.
    if (errorKind(failure) === "WorktreeChanged") {
      void refetchLocalSnapshot();
      return;
    }
  }, [diff.error, whole.error, isWorktree, refetchLocalSnapshot]);

  useEffect(() => {
    if (embedded) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") selectFile(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [embedded, selectFile]);

  const setMode = (next: Mode) => {
    setChoice({ key, mode: next });
  };

  return (
    <section
      className="file-diff"
      aria-label={t(isSnapshot ? "diff.fileAt" : "diff.changes", { path })}
    >
      <header className="file-diff__head">
        {!embedded && (
          <button
            type="button"
            className="file-diff__back"
            title={t("diff.backHint")}
            onClick={() => {
              selectFile(null);
            }}
          >
            {t("diff.back")}
          </button>
        )}

        <div className="file-diff__title">
          <span className="file-diff__path" title={path}>
            {path}
          </span>
          <span className="file-diff__commit">
            {isWorktree
              ? t(
                  props.worktree.side === "staged"
                    ? "diff.localStaged"
                    : "diff.localUnstaged",
                )
              : t("diff.inCommit", {
                  id: shortId(props.commit.id),
                  summary: props.commit.summary,
                })}
          </span>
        </div>

        <div className="file-diff__controls">
          {!isSnapshot && (deleted ? previousCommitId !== null : true) && (
            <div
              className="segmented"
              role="group"
              aria-label={t("diff.modeLabel")}
            >
              <button
                type="button"
                className="segmented__option"
                aria-pressed={mode === "diff"}
                onClick={() => {
                  setMode("diff");
                }}
              >
                {t("diff.modeChanges")}
              </button>
              <button
                type="button"
                className="segmented__option"
                aria-pressed={mode === "file"}
                onClick={() => {
                  setMode("file");
                }}
              >
                {deleted ? t("diff.modeBeforeDeletion") : t("diff.modeWhole")}
              </button>
            </div>
          )}

          <button
            type="button"
            className="button file-diff__toggle"
            aria-pressed={wrap}
            title={t("diff.wrapHint")}
            onClick={() => {
              setWrap((on) => !on);
            }}
          >
            {t("diff.wrap")}
          </button>

          {!isSnapshot && !embedded && (
            <button
              type="button"
              className="button file-diff__history"
              disabled={historyUnavailable !== null}
              title={
                historyUnavailable === null
                  ? t("fileHistory:open")
                  : t(`fileHistory:unavailable.${historyUnavailable}`)
              }
              onClick={() => {
                if (historyStart !== null) {
                  openFileHistory(path, historyStart, isWorktree);
                }
              }}
            >
              {t("fileHistory:open")}
            </button>
          )}

          {props.actions}

          {file !== undefined && mode === "diff" && (
            <span className="file-diff__stat">
              <DiffStat
                insertions={file.insertions}
                deletions={file.deletions}
              />
            </span>
          )}
          {mode === "file" && whole.data !== undefined && (
            <span className="file-diff__stat">
              {t("diff.lines", { count: whole.data.lines })}
            </span>
          )}
        </div>
      </header>

      <div className="file-diff__body">
        {isWorktree && localSnapshot.error !== null && (
          <div className="state file-diff__state" role="alert">
            <ErrorMessage error={localSnapshot.error} />
          </div>
        )}
        {mode === "diff" ? (
          <>
            {diff.isPending && (
              <p className="state file-diff__state">{t("diff.readingDiff")}</p>
            )}
            {diff.error !== null && (
              <div className="state file-diff__state" role="alert">
                <ErrorMessage error={diff.error} />
              </div>
            )}
            {diff.data !== undefined && file === undefined && (
              <p className="state file-diff__state" role="alert">
                {isWorktree
                  ? t("diff.notInLocal")
                  : t("diff.notInCommit", { path })}
              </p>
            )}
            {file !== undefined && (
              <DiffViewer
                file={file}
                wrap={wrap}
                expanding={diff.isFetching}
                onExpand={() => {
                  expandFile(path);
                }}
              />
            )}
          </>
        ) : (
          <>
            {deleted && previousCommitId !== null && (
              <p className="diff-viewer__notice">
                {t("diff.beforeDeletion", { id: shortId(previousCommitId) })}
              </p>
            )}
            {whole.isPending && (
              <p className="state file-diff__state">{t("diff.readingFile")}</p>
            )}
            {whole.error !== null && (
              <div className="state file-diff__state" role="alert">
                <ErrorMessage error={whole.error} />
              </div>
            )}
            {whole.data !== undefined && (
              <WholeFilePreview
                content={whole.data}
                path={path}
                wrap={wrap}
                fetching={whole.isFetching}
                expanded={expanded}
                onExpand={() => {
                  expandFile(path);
                }}
              />
            )}
          </>
        )}
      </div>
    </section>
  );
}
