import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import type { CommitInfo } from "../../bindings";
import { getFileContent } from "../../lib/ipc";
import { useCommitDiff } from "../../state/diff";
import { useSession } from "../../state/session";
import { shortId } from "../CommitTable/format";
import { LineTable, parseWholeFile } from "../DiffViewer";
import { DiffViewer } from "../DiffViewer";

import "./FileDiffView.css";

export interface FileDiffViewProps {
  readonly repositoryPath: string;
  readonly commit: CommitInfo;
  readonly path: string;
}

/** Which of the two readings of a file is on screen. */
type Mode = "diff" | "file";

/**
 * One file, filling the centre panel, as a patch or in full.
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

  const [wrap, setWrap] = useState(false);

  /*
   * The chosen mode is stored with the file it belongs to, so opening another
   * file falls back to its diff by derivation. Resetting it in an effect
   * renders the new file once in the previous file's mode before correcting
   * itself, which shows the wrong thing for a frame.
   */
  const [choice, setChoice] = useState<{
    key: string;
    mode: Mode;
    expand: boolean;
  }>({ key: "", mode: "diff", expand: false });
  const key = `${commit.id}/${path}`;
  const mode: Mode = choice.key === key ? choice.mode : "diff";
  const expandWholeFile = choice.key === key && choice.expand;

  const setMode = (next: Mode) => {
    setChoice({ key, mode: next, expand: expandWholeFile });
  };

  const diff = useCommitDiff(repositoryPath, commit.id, expandPath);
  const file = diff.data?.files.find((entry) => entry.path === path);

  // A commit that deleted the file has nothing to show in full, so the choice
  // is not offered rather than offered and then failing.
  const deleted = file?.change === "Deleted";

  const whole = useQuery({
    queryKey: ["file", repositoryPath, commit.id, path, expandWholeFile],
    enabled: mode === "file" && !deleted,
    queryFn: () =>
      getFileContent(repositoryPath, {
        commit_id: commit.id,
        path,
        expand: expandWholeFile,
      }),
    staleTime: Infinity,
  });

  const text = whole.data?.text ?? null;
  const wholeLines = useMemo(
    () => (text === null ? [] : parseWholeFile(text)),
    [text],
  );

  useEffect(() => {
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

        <div className="file-diff__controls">
          {!deleted && (
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
        {mode === "diff" ? (
          <>
            {diff.isPending && (
              <p className="file-diff__state">Leyendo el diff…</p>
            )}
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
                wrap={wrap}
                expanding={diff.isFetching && expandPath === file.path}
                onExpand={expandFile}
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
                {whole.error.message}
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
                  Archivo de {whole.data.lines} líneas, retenido para no
                  bloquear la vista.
                </p>
                <button
                  type="button"
                  className="button"
                  disabled={whole.isFetching}
                  onClick={() => {
                    setChoice({ key, mode: "file", expand: true });
                  }}
                >
                  {whole.isFetching ? "Cargando…" : "Ver archivo completo"}
                </button>
              </div>
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
