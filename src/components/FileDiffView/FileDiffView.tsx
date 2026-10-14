import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type {
  CommitInfo,
  FileContent,
  WorktreeFileContent,
} from "../../bindings";
import { errorKind } from "../../lib/errors";
import { getFileContent, getWorktreeFileContent } from "../../lib/ipc";
import { useCommitDiff } from "../../state/diff";
import { useNavigation, useNavigationActions } from "../../state/workspace";
import { useWorktreeFileDiff, useWorktreeSnapshot } from "../../state/worktree";
import { queryKeys } from "../../state/queryKeys";
import { shortId } from "../CommitTable/format";
import { DiffViewer, LineTable, parseWholeFile } from "../DiffViewer";
import { DiffStat } from "../DiffStat/DiffStat";
import { ErrorMessage } from "../ErrorMessage";

import "./FileDiffView.css";

interface SharedProps {
  readonly repositoryPath: string;
  readonly path: string;
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
  const { t } = useTranslation(["files", "common"]);
  const { repositoryPath, path } = props;

  const { selectFile, expandFile } = useNavigationActions();
  const expandPath = useNavigation((navigation) => navigation.expandedFilePath);
  const [wrap, setWrap] = useState(true);
  const [choice, setChoice] = useState<{
    key: string;
    mode: Mode;
  }>({ key: "", mode: "diff" });

  const isWorktree = props.worktree !== undefined;
  const isSnapshot = !isWorktree && props.snapshot === true;
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
      !deleted &&
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
        commit_id: props.commit.id,
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
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") selectFile(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [selectFile]);

  const wholeText = whole.data?.text ?? null;
  const wholeLines = useMemo(
    () => (wholeText === null ? [] : parseWholeFile(wholeText)),
    [wholeText],
  );

  const setMode = (next: Mode) => {
    setChoice({ key, mode: next });
  };

  return (
    <section
      className="file-diff"
      aria-label={t(isSnapshot ? "diff.fileAt" : "diff.changes", { path })}
    >
      <header className="file-diff__head">
        <button
          type="button"
          className="file-diff__back"
          onClick={() => {
            selectFile(null);
          }}
        >
          {t("diff.back")}
        </button>

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
          {!deleted && !isSnapshot && (
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
                {t("diff.modeWhole")}
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
            {whole.isPending && (
              <p className="state file-diff__state">{t("diff.readingFile")}</p>
            )}
            {whole.error !== null && (
              <div className="state file-diff__state" role="alert">
                <ErrorMessage error={whole.error} />
              </div>
            )}
            {whole.data?.omitted === "Binary" && (
              <p className="diff-viewer__notice">
                {t("diff.binaryFile", { count: Number(whole.data.bytes) })}
              </p>
            )}
            {whole.data?.omitted === "TooLarge" && (
              <div className="diff-viewer__notice">
                <p className="diff-viewer__notice-text">
                  {t("diff.tooLarge", { count: Number(whole.data.bytes) })}
                </p>
                <button
                  type="button"
                  className="button"
                  disabled={whole.isFetching}
                  onClick={() => {
                    expandFile(path);
                  }}
                >
                  {whole.isFetching
                    ? t("common:actions.loading")
                    : t("diff.loadWhole")}
                </button>
              </div>
            )}
            {whole.data?.text === "" && (
              <p className="state file-diff__state">{t("diff.emptyFile")}</p>
            )}
            {wholeLines.length > 0 && (
              <LineTable
                lines={wholeLines}
                wrap={wrap}
                highlight={{ path, mode: "source" }}
              />
            )}
          </>
        )}
      </div>
    </section>
  );
}
