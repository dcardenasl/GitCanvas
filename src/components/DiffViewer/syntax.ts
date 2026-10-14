import type { RootContent } from "hast";
import { refractor, type Syntax } from "refractor/core";
import css from "refractor/css";
import javascript from "refractor/javascript";
import json from "refractor/json";
import jsx from "refractor/jsx";
import markdown from "refractor/markdown";
import markup from "refractor/markup";
import php from "refractor/php";
import rust from "refractor/rust";
import tsx from "refractor/tsx";
import typescript from "refractor/typescript";
import type { SyntaxLanguage } from "./language";
import type { DiffLine } from "./parse";
import type {
  HighlightedLines,
  HighlightedRow,
  SyntaxCategory,
  SyntaxSegment,
} from "./tokens";

/**
 * One grammar per supported language. The `Record` is exhaustive on purpose:
 * adding a language to `SYNTAX_LANGUAGES` without a grammar here is a type
 * error. Grammars that extend others (`tsx` over `jsx` and `typescript`,
 * `markdown` over `markup`) are registered together, so order is irrelevant.
 */
const GRAMMARS: Readonly<Record<SyntaxLanguage, Syntax>> = {
  css,
  javascript,
  json,
  jsx,
  markdown,
  markup,
  php,
  rust,
  typescript,
  tsx,
};

for (const grammar of Object.values(GRAMMARS)) refractor.register(grammar);

/** Prism token scopes folded into the viewer's smaller set of categories. */
const SCOPE_CATEGORY: ReadonlyMap<string, SyntaxCategory> = new Map([
  ["keyword", "keyword"],
  ["boolean", "keyword"],
  ["important", "keyword"],
  ["string", "string"],
  ["char", "string"],
  ["regex", "string"],
  ["template-string", "string"],
  ["number", "number"],
  ["constant", "number"],
  ["function", "function"],
  ["function-variable", "function"],
  ["comment", "comment"],
  ["prolog", "comment"],
  ["doctype", "comment"],
  ["cdata", "comment"],
  ["operator", "operator"],
  ["entity", "operator"],
  ["tag", "tag"],
  ["namespace", "tag"],
  ["attr-name", "attribute"],
  ["attribute-name", "attribute"],
  ["property", "property"],
  ["selector", "property"],
  ["class-name", "property"],
  ["builtin", "property"],
  ["punctuation", "punctuation"],
  ["title", "heading"],
  ["bold", "emphasis"],
  ["italic", "emphasis"],
  ["strike", "emphasis"],
  ["code", "code"],
  ["code-snippet", "code"],
]);

function sameCategories(
  a: readonly SyntaxCategory[],
  b: readonly SyntaxCategory[],
): boolean {
  return a.length === b.length && a.every((category, i) => category === b[i]);
}

/** Appends text to the last row, splitting on newlines and merging equal runs. */
function appendText(
  value: string,
  categories: readonly SyntaxCategory[],
  rows: SyntaxSegment[][],
): void {
  const chunks = value.split("\n");
  chunks.forEach((chunk, index) => {
    if (chunk !== "") {
      const row = rows.at(-1) ?? [];
      const previous = row.at(-1);
      if (
        previous !== undefined &&
        sameCategories(previous.categories, categories)
      ) {
        row[row.length - 1] = { text: previous.text + chunk, categories };
      } else {
        row.push({ text: chunk, categories });
      }
    }
    if (index < chunks.length - 1) rows.push([]);
  });
}

function visit(
  node: RootContent,
  inherited: readonly SyntaxCategory[],
  rows: SyntaxSegment[][],
): void {
  if (node.type === "text") {
    appendText(node.value, inherited, rows);
    return;
  }
  if (node.type !== "element") return;

  const scopes = node.properties.className;
  const own = Array.isArray(scopes)
    ? scopes.flatMap((scope) => {
        const category =
          typeof scope === "string" ? SCOPE_CATEGORY.get(scope) : undefined;
        return category === undefined ? [] : [category];
      })
    : [];
  const categories =
    own.length === 0 ? inherited : [...new Set([...inherited, ...own])];
  for (const child of node.children) visit(child, categories, rows);
}

/** Tokenizes a complete source sequence and keeps token scopes across newlines. */
export function highlightSource(
  source: string,
  language: SyntaxLanguage,
): HighlightedLines {
  const rows: SyntaxSegment[][] = [[]];
  for (const node of refractor.highlight(source, language).children) {
    visit(node, [], rows);
  }
  return rows;
}

/** The part of a diff row the highlighter reads. */
export type HighlightableLine = Pick<DiffLine, "kind" | "text">;

interface HunkRow {
  readonly index: number;
  readonly line: HighlightableLine;
}

/** Groups content rows by hunk; a hunk header starts a new, independent group. */
function splitHunks(lines: readonly HighlightableLine[]): HunkRow[][] {
  const hunks: HunkRow[][] = [];
  let current: HunkRow[] = [];
  lines.forEach((line, index) => {
    if (line.kind === "meta") {
      if (line.text.startsWith("@@ ") && current.length > 0) {
        hunks.push(current);
        current = [];
      }
      return;
    }
    current.push({ index, line });
  });
  if (current.length > 0) hunks.push(current);
  return hunks;
}

/** Tokenizes one side of a hunk and maps each of its rows to its tokens. */
function highlightSide(
  rows: readonly HunkRow[],
  language: SyntaxLanguage,
): ReadonlyMap<number, HighlightedRow> {
  const tokens = highlightSource(
    rows.map(({ line }) => line.text).join("\n"),
    language,
  );
  return new Map(
    rows.map(({ index }, position) => [index, tokens[position] ?? []]),
  );
}

/**
 * Highlights each visible diff hunk as independent old/new source sequences.
 * Deleted rows use old-side scopes; added and context rows use new-side scopes.
 * Hunk headers and "no newline" notices have no tokens (`null`).
 */
export function highlightDiff(
  lines: readonly HighlightableLine[],
  language: SyntaxLanguage,
): readonly (HighlightedRow | null)[] {
  const result: (HighlightedRow | null)[] = lines.map(() => null);
  for (const hunk of splitHunks(lines)) {
    const oldSide = highlightSide(
      hunk.filter(({ line }) => line.kind !== "add"),
      language,
    );
    const newSide = highlightSide(
      hunk.filter(({ line }) => line.kind !== "del"),
      language,
    );
    for (const { index, line } of hunk) {
      result[index] =
        (line.kind === "del" ? oldSide : newSide).get(index) ?? [];
    }
  }
  return result;
}
