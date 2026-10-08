import { useMemo } from "react";

import type { FileDiff } from "../../lib/ipc";

import { parseHunks, type DiffLine } from "./parse";

import "./DiffViewer.css";

/** Patch content and expansion/display controls for a single file. */
export interface DiffViewerProps {
  readonly file: FileDiff;
  /** Requests the full patch for a file held back by the size guard. */
  readonly onExpand: (path: string) => void;
  readonly expanding: boolean;
  /** Wrap long lines instead of scrolling them horizontally. */
  readonly wrap: boolean;
}

/**
 * Renders one file's unified patch.
 *
 * Files the engine withheld — binary content, or a change past the size guard
 * — render an explanation instead of an empty box, so the interface never
 * looks like it silently failed.
 */
export function DiffViewer({
  file,
  onExpand,
  expanding,
  wrap,
}: DiffViewerProps) {
  const lines = useMemo(
    () => (file.patch === null ? [] : parseHunks(file.patch)),
    [file.patch],
  );

  if (file.omitted === "Binary") {
    return (
      <p className="diff-viewer__notice">
        Archivo binario. No hay diferencias de texto que mostrar.
      </p>
    );
  }

  if (file.omitted === "TooLarge") {
    return (
      <div className="diff-viewer__notice">
        <p className="diff-viewer__notice-text">
          Diff de {file.insertions + file.deletions} líneas, retenido para no
          bloquear la vista.
        </p>
        <button
          type="button"
          className="button"
          disabled={expanding}
          onClick={() => {
            onExpand(file.path);
          }}
        >
          {expanding ? "Cargando…" : "Ver diff completo"}
        </button>
      </div>
    );
  }

  if (lines.length === 0) {
    return <p className="diff-viewer__notice">Sin cambios de contenido.</p>;
  }

  return <LineTable lines={lines} wrap={wrap} showOldColumn />;
}

/** Diff rows and formatting options for the numbered line grid. */
export interface LineTableProps {
  readonly lines: readonly DiffLine[];
  readonly wrap: boolean;
  /** Whether to show the parent-revision numbers; a whole file has only one side. */
  readonly showOldColumn?: boolean;
}

const LINE_CLASS: Record<DiffLine["kind"], string> = {
  add: "diff-line diff-line--add",
  del: "diff-line diff-line--del",
  context: "diff-line",
  meta: "diff-line diff-line--meta",
};

/**
 * The numbered line grid, shared by the patch and whole-file views.
 *
 * Line numbers are real cells rather than generated content, so they can be
 * selected and copied — and so that selecting the code does not drag the
 * numbers along with it, which is what makes a copied snippet unusable.
 */
export function LineTable({
  lines,
  wrap,
  showOldColumn = false,
}: LineTableProps) {
  return (
    <div
      className={[
        "diff-viewer",
        wrap ? "diff-viewer--wrap" : "",
        showOldColumn ? "diff-viewer--two-sided" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {lines.map((line, index) => (
        <div
          // Patch lines have no identity of their own; position is the only key.
          key={`${String(index)}-${line.text.slice(0, 12)}`}
          className={LINE_CLASS[line.kind]}
        >
          {showOldColumn && (
            <span className="diff-line__number" aria-hidden="true">
              {line.oldLine ?? ""}
            </span>
          )}
          <span className="diff-line__number" aria-hidden="true">
            {line.newLine ?? ""}
          </span>
          <span className="diff-line__marker" aria-hidden="true" />
          <span className="diff-line__text">{line.text}</span>
        </div>
      ))}
    </div>
  );
}
