import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { FileDiff } from "../../lib/ipc";
import type { SyntaxSegment } from "./syntax";

import { canHighlightPath, syntaxLanguageForPath } from "./language";
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
  const { t } = useTranslation(["files", "common"]);
  const lines = useMemo(
    () => (file.patch === null ? [] : parseHunks(file.patch)),
    [file.patch],
  );

  if (file.omitted === "Binary") {
    return <p className="diff-viewer__notice">{t("viewer.binary")}</p>;
  }

  if (file.omitted === "TooLarge") {
    return (
      <div className="diff-viewer__notice">
        <p className="diff-viewer__notice-text">
          {t("viewer.tooLarge", { count: file.insertions + file.deletions })}
        </p>
        <button
          type="button"
          className="button"
          disabled={expanding}
          onClick={() => {
            onExpand(file.path);
          }}
        >
          {expanding ? t("common:actions.loading") : t("viewer.loadFull")}
        </button>
      </div>
    );
  }

  if (lines.length === 0) {
    return <p className="diff-viewer__notice">{t("viewer.noChanges")}</p>;
  }

  return (
    <LineTable
      lines={lines}
      wrap={wrap}
      showOldColumn
      path={file.path}
      mode="diff"
    />
  );
}

/** Diff rows and formatting options for the numbered line grid. */
export interface LineTableProps {
  readonly lines: readonly DiffLine[];
  readonly wrap: boolean;
  readonly path?: string;
  readonly mode?: "diff" | "file";
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
  path,
  mode = "file",
}: LineTableProps) {
  const language = path === undefined ? null : syntaxLanguageForPath(path);
  const characterCount = useMemo(
    () => lines.reduce((total, line) => total + line.text.length, 0),
    [lines],
  );
  const [highlightResult, setHighlightResult] = useState<{
    readonly input: readonly DiffLine[];
    readonly path: string;
    readonly mode: "diff" | "file";
    readonly lines: readonly (readonly SyntaxSegment[] | null)[];
  } | null>(null);

  useEffect(() => {
    const requestedLanguage = language;
    if (
      path === undefined ||
      requestedLanguage === null ||
      !canHighlightPath(path, lines.length, characterCount)
    ) {
      return;
    }
    let current = true;

    void import("./syntax")
      .then((syntax) => {
        const highlighted =
          mode === "diff"
            ? syntax.highlightDiff(lines, requestedLanguage)
            : syntax.highlightSource(
                lines.map((line) => line.text).join("\n"),
                requestedLanguage,
              );
        if (!current) return;
        setHighlightResult({
          input: lines,
          path,
          mode,
          lines:
            mode === "diff"
              ? highlighted
              : lines.map((_, index) => highlighted[index] ?? []),
        });
      })
      .catch(() => {
        // A grammar failure should never make source content unavailable.
      });

    return () => {
      current = false;
    };
  }, [characterCount, language, lines, mode, path]);

  const highlightedLines =
    highlightResult?.input === lines &&
    highlightResult.path === path &&
    highlightResult.mode === mode
      ? highlightResult.lines
      : null;

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
          <span className="diff-line__text">
            {highlightedLines?.[index] == null
              ? line.text
              : highlightedLines[index].map((segment, segmentIndex) =>
                  segment.categories.length === 0 ? (
                    segment.text
                  ) : (
                    <span
                      key={segmentIndex}
                      className={segment.categories
                        .map((category) => `syntax-token--${category}`)
                        .join(" ")}
                    >
                      {segment.text}
                    </span>
                  ),
                )}
          </span>
        </div>
      ))}
    </div>
  );
}
