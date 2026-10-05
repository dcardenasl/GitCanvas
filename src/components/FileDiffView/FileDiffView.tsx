import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import type {
  CommitInfo,
  FileContent,
  WorktreeFileContent,
} from "../../bindings";
import { userMessage } from "../../lib/errors";
import { getFileContent, getWorktreeFileContent } from "../../lib/ipc";
import { errorKind } from "../../lib/errors";
import { useCommitDiff } from "../../state/diff";
import { useSession } from "../../state/session";
import { useWorktreeFileDiff, useWorktreeSnapshot } from "../../state/worktree";
import { shortId } from "../CommitTable/format";
import { LineTable, parseWholeFile } from "../DiffViewer";
import { DiffViewer } from "../DiffViewer";

import "./FileDiffView.css";

interface SharedProps {
  readonly repositoryPath: string;
  readonly path: string;
}

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
  const { repositoryPath, path } = props;
  const selectFile = useSession((state) => state.selectFile);
  const expandPath = useSession((state) => state.expandedFilePath);
  const expandFile = useSession((state) => state.expandFile);
  const [wrap, setWrap] = useState(false);
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
    queryKey: [
      isWorktree ? "worktree-file" : "file",
      repositoryPath,
      isWorktree ? props.worktree.side : props.commit.id,
      path,
      expanded,
      localRevision,
    ],
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
      aria-label={`${isSnapshot ? "Archivo en" : "Cambios en"} ${path}`}
    >
      <header className="file-diff__head">
        <button
          type="button"
          className="file-diff__back"
          onClick={() => {
            selectFile(null);
          }}
        >
          ← Volver al graph
        </button>

        <div className="file-diff__title">
          <span className="file-diff__path" title={path}>
            {path}
          </span>
          <span className="file-diff__commit">
            {isWorktree
              ? `cambios locales · ${props.worktree.side === "staged" ? "preparado" : "sin preparar"}`
              : `en ${shortId(props.commit.id)} · ${props.commit.summary}`}
          </span>
        </div>

        <div className="file-diff__controls">
          {!deleted && !isSnapshot && (
            <div
              className="segmented"
              role="group"
              aria-label="Qué mostrar del archivo"
            >
              <button
                type="button"
                className="segmented__option"
                aria-pressed={mode === "diff"}
                onClick={() => {
                  setMode("diff");
                }}
              >
                Cambios
              </button>
              <button
                type="button"
                className="segmented__option"
                aria-pressed={mode === "file"}
                onClick={() => {
                  setMode("file");
                }}
              >
                Archivo completo
              </button>
            </div>
          )}

          <button
            type="button"
            className="file-diff__toggle"
            aria-pressed={wrap}
            title="Ajustar las líneas largas en vez de desplazarlas"
            onClick={() => {
              setWrap((on) => !on);
            }}
          >
            Ajustar líneas
          </button>

          {file !== undefined && mode === "diff" && (
            <span className="file-diff__stat">
              <span className="detail-panel__stat-add">+{file.insertions}</span>{" "}
              <span className="detail-panel__stat-del">−{file.deletions}</span>
            </span>
          )}
          {mode === "file" && whole.data !== undefined && (
            <span className="file-diff__stat">{whole.data.lines} líneas</span>
          )}
        </div>
      </header>

      <div className="file-diff__body">
        {isWorktree && localSnapshot.error !== null && (
          <p className="file-diff__state" role="alert">
            {userMessage(localSnapshot.error)}
          </p>
        )}
        {mode === "diff" ? (
          <>
            {diff.isPending && (
              <p className="file-diff__state">Leyendo el diff…</p>
            )}
            {diff.error !== null && (
              <p className="file-diff__state" role="alert">
                {userMessage(diff.error)}
              </p>
            )}
            {diff.data !== undefined && file === undefined && (
              <p className="file-diff__state" role="alert">
                {isWorktree
                  ? "Este archivo ya no forma parte de los cambios locales."
                  : `Este commit no modifica ${path}.`}
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
              <p className="file-diff__state">Leyendo el archivo…</p>
            )}
            {whole.error !== null && (
              <p className="file-diff__state" role="alert">
                {userMessage(whole.error)}
              </p>
            )}
            {whole.data?.omitted === "Binary" && (
              <p className="diff-viewer__notice">
                Archivo binario de {whole.data.bytes} bytes. No hay texto que
                mostrar.
              </p>
            )}
            {whole.data?.omitted === "TooLarge" && (
              <div className="diff-viewer__notice">
                <p className="diff-viewer__notice-text">
                  Archivo de {whole.data.bytes} bytes, retenido para no bloquear
                  la vista.
                </p>
                <button
                  type="button"
                  className="button"
                  disabled={whole.isFetching}
                  onClick={() => {
                    expandFile(path);
                  }}
                >
                  {whole.isFetching ? "Cargando…" : "Ver archivo completo"}
                </button>
              </div>
            )}
            {whole.data?.text === "" && (
              <p className="file-diff__state">El archivo está vacío.</p>
            )}
            {wholeLines.length > 0 && (
              <LineTable lines={wholeLines} wrap={wrap} />
            )}
          </>
        )}
      </div>
    </section>
  );
}
