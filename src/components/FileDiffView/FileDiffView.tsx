import { useEffect } from "react";

import type { CommitInfo } from "../../bindings";
import { useCommitDiff } from "../../state/diff";
import { useSession } from "../../state/session";
import { shortId } from "../CommitTable/format";
import { DiffViewer } from "../DiffViewer";

import "./FileDiffView.css";

export interface FileDiffViewProps {
  readonly repositoryPath: string;
  readonly commit: CommitInfo;
  readonly path: string;
}

/**
 * One file's changes, filling the centre panel.
 *
 * The width is the point. A unified diff of indented code needs room, and the
 * inspector column never had it; here a hunk reads without wrapping or
 * horizontal scrolling for anything but genuinely long lines.
 */
export function FileDiffView({
  repositoryPath,
  commit,
  path,
}: FileDiffViewProps) {
  const selectFile = useSession((state) => state.selectFile);
  const expandPath = useSession((state) => state.expandedFilePath);
  const expandFile = useSession((state) => state.expandFile);

  const diff = useCommitDiff(repositoryPath, commit.id, expandPath);
  const file = diff.data?.files.find((entry) => entry.path === path);

  useEffect(() => {
    // Escape returns to the graph, the same way it closes the confirmations.
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") selectFile(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [selectFile]);

  return (
    <section className="file-diff" aria-label={`Cambios en ${path}`}>
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
            en {shortId(commit.id)} · {commit.summary}
          </span>
        </div>

        {file !== undefined && (
          <span className="file-diff__stat">
            <span className="detail-panel__stat-add">+{file.insertions}</span>{" "}
            <span className="detail-panel__stat-del">−{file.deletions}</span>
          </span>
        )}
      </header>

      <div className="file-diff__body">
        {diff.isPending && <p className="file-diff__state">Leyendo el diff…</p>}

        {diff.error !== null && (
          <p className="file-diff__state" role="alert">
            {diff.error.message}
          </p>
        )}

        {diff.data !== undefined && file === undefined && (
          <p className="file-diff__state" role="alert">
            Este commit no modifica {path}.
          </p>
        )}

        {file !== undefined && (
          <DiffViewer
            file={file}
            expanding={diff.isFetching && expandPath === file.path}
            onExpand={expandFile}
          />
        )}
      </div>
    </section>
  );
}
