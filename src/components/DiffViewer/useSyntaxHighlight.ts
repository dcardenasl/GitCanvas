import { useEffect, useMemo, useState } from "react";

import { syntaxHighlighter } from "./highlighter";
import type { HighlightMode, HighlightRows } from "./highlightProtocol";
import { canHighlightPath, syntaxLanguageForPath } from "./language";
import type { DiffLine } from "./parse";

/** Which file the lines belong to and how they are laid out. */
export interface HighlightTarget {
  readonly path: string;
  readonly mode: HighlightMode;
}

interface Highlighted {
  readonly input: readonly DiffLine[];
  readonly path: string;
  readonly mode: HighlightMode;
  readonly rows: HighlightRows;
}

/**
 * Tokenizes `lines` of the `target` file off the interface thread.
 *
 * Returns `null` — plain text — while the worker is busy, when the path has no
 * grammar or exceeds the budgets, and when highlighting fails; the content is
 * never withheld. A result is used only for the exact lines, path and mode it
 * was computed for, so a quick change of selection cannot show another file's
 * colors.
 */
export function useSyntaxHighlight(
  lines: readonly DiffLine[],
  target: HighlightTarget | undefined,
): HighlightRows | null {
  const path = target?.path;
  const mode = target?.mode;
  const [highlighted, setHighlighted] = useState<Highlighted | null>(null);
  const characterCount = useMemo(
    () => lines.reduce((total, line) => total + line.text.length, 0),
    [lines],
  );
  const language = path === undefined ? null : syntaxLanguageForPath(path);
  const eligible =
    path !== undefined &&
    mode !== undefined &&
    language !== null &&
    canHighlightPath(path, lines.length, characterCount);

  useEffect(() => {
    if (!eligible) return;
    const controller = new AbortController();
    const rows =
      mode === "diff"
        ? syntaxHighlighter.highlight(
            {
              mode,
              language,
              lines: lines.map(({ kind, text }) => ({ kind, text })),
            },
            controller.signal,
          )
        : syntaxHighlighter.highlight(
            { mode, language, lines: lines.map(({ text }) => text) },
            controller.signal,
          );
    rows.then(
      (result) => {
        setHighlighted({ input: lines, path, mode, rows: result });
      },
      () => {
        // Cancelled or unavailable: the plain text already on screen stays.
      },
    );
    return () => {
      controller.abort();
    };
  }, [eligible, language, lines, mode, path]);

  return highlighted?.input === lines &&
    highlighted.path === path &&
    highlighted.mode === mode
    ? highlighted.rows
    : null;
}
