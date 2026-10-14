/**
 * Stable syntax categories. Each one has a `.syntax-token--<category>` rule in
 * `DiffViewer.css` and a `--syntax-<category>` color per theme in `App.css`;
 * `tokens.test.ts` fails when either is missing.
 */
export const SYNTAX_CATEGORIES = [
  "keyword",
  "string",
  "number",
  "function",
  "comment",
  "operator",
  "tag",
  "attribute",
  "property",
  "punctuation",
  "heading",
  "emphasis",
  "code",
] as const;

/** A semantic color category used by the viewer's theme-aware token palette. */
export type SyntaxCategory = (typeof SYNTAX_CATEGORIES)[number];

/** Source text and any semantic color categories applied to that exact text. */
export interface SyntaxSegment {
  readonly text: string;
  readonly categories: readonly SyntaxCategory[];
}

/** One row of highlighted source: its segments joined are the row's text. */
export type HighlightedRow = readonly SyntaxSegment[];

/** Highlighted source split into rows without changing its original characters. */
export type HighlightedLines = readonly HighlightedRow[];
