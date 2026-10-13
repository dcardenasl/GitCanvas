import type { Element, Root, Text } from "hast";
import { refractor } from "refractor/core";
import css from "refractor/css";
import javascript from "refractor/javascript";
import jsx from "refractor/jsx";
import json from "refractor/json";
import markdown from "refractor/markdown";
import markup from "refractor/markup";
import php from "refractor/php";
import rust from "refractor/rust";
import typescript from "refractor/typescript";
import tsx from "refractor/tsx";
import type { SyntaxLanguage } from "./language";
export type { SyntaxLanguage } from "./language";

/** Stable syntax categories used by the viewer's theme-aware token palette. */
export type SyntaxCategory =
  | "keyword"
  | "string"
  | "number"
  | "function"
  | "comment"
  | "operator"
  | "tag"
  | "attribute"
  | "property"
  | "punctuation"
  | "heading"
  | "emphasis"
  | "code";

/** Source text and any semantic color categories applied to that exact text. */
export interface SyntaxSegment {
  readonly text: string;
  readonly categories: readonly SyntaxCategory[];
}

/** Highlighted source split into rows without changing its original characters. */
export type HighlightedLines = readonly (readonly SyntaxSegment[])[];

const grammars = [
  markdown,
  markup,
  css,
  javascript,
  jsx,
  typescript,
  tsx,
  php,
  rust,
  json,
] as const;

let registered = false;

function registerGrammars(): void {
  if (registered) return;
  for (const grammar of grammars) refractor.register(grammar);
  registered = true;
}

function categoryFor(scope: string): SyntaxCategory | null {
  if (["keyword", "boolean", "important"].includes(scope)) return "keyword";
  if (["string", "char", "regex", "template-string"].includes(scope)) {
    return "string";
  }
  if (["number", "constant"].includes(scope)) return "number";
  if (["function", "function-variable"].includes(scope)) return "function";
  if (["comment", "prolog", "doctype", "cdata"].includes(scope)) {
    return "comment";
  }
  if (["operator", "entity"].includes(scope)) return "operator";
  if (["tag", "namespace"].includes(scope)) return "tag";
  if (["attr-name", "attribute-name"].includes(scope)) return "attribute";
  if (["property", "selector", "class-name", "builtin"].includes(scope)) {
    return "property";
  }
  if (["punctuation"].includes(scope)) return "punctuation";
  if (["title"].includes(scope)) return "heading";
  if (["bold", "italic", "strike"].includes(scope)) return "emphasis";
  if (["code", "code-snippet"].includes(scope)) return "code";
  return null;
}

function appendText(
  value: string,
  categories: readonly SyntaxCategory[],
  lines: SyntaxSegment[][],
): void {
  const chunks = value.split("\n");
  chunks.forEach((chunk, index) => {
    if (chunk !== "") {
      const currentLine = lines.at(-1) ?? [];
      const previous = currentLine.at(-1);
      if (previous?.categories.join(" ") === categories.join(" ")) {
        currentLine.pop();
        currentLine.push({
          text: previous.text + chunk,
          categories,
        });
      } else {
        currentLine.push({ text: chunk, categories });
      }
    }
    if (index < chunks.length - 1) lines.push([]);
  });
}

function visitNode(
  node: Element | Text,
  inherited: readonly SyntaxCategory[],
  lines: SyntaxSegment[][],
): void {
  if (node.type === "text") {
    appendText(node.value, inherited, lines);
    return;
  }

  const scopeClasses = node.properties.className;
  const ownCategories = Array.isArray(scopeClasses)
    ? scopeClasses
        .filter((scope): scope is string => typeof scope === "string")
        .map(categoryFor)
        .filter((category): category is SyntaxCategory => category !== null)
    : [];
  const categories = [...new Set([...inherited, ...ownCategories])];
  for (const child of node.children) {
    if (child.type === "text") visitNode(child, categories, lines);
    else if (child.type === "element") visitNode(child, categories, lines);
  }
}

/** Tokenizes a complete source sequence and keeps token scopes across newlines. */
export function highlightSource(
  source: string,
  language: SyntaxLanguage,
): HighlightedLines {
  registerGrammars();
  const grammar = language === "javascript" ? "javascript" : language;
  const tree: Root = refractor.highlight(source, grammar);
  const lines: SyntaxSegment[][] = [[]];
  for (const child of tree.children) {
    if (child.type === "text") visitNode(child, [], lines);
    else if (child.type === "element") visitNode(child, [], lines);
  }
  return lines;
}

function isHunkHeader(line: string): boolean {
  return line.startsWith("@@ ");
}

/**
 * Highlights each visible diff hunk as independent old/new source sequences.
 * Deleted rows use old-side scopes; added and context rows use new-side scopes.
 */
export function highlightDiff(
  lines: readonly { readonly kind: string; readonly text: string }[],
  language: SyntaxLanguage,
): readonly (readonly SyntaxSegment[] | null)[] {
  const result: (readonly SyntaxSegment[] | null)[] = lines.map(() => null);
  let hunkRows: number[] = [];

  const flushHunk = () => {
    if (hunkRows.length === 0) return;

    const oldRows: number[] = [];
    const newRows: number[] = [];
    for (const rowIndex of hunkRows) {
      const kind = lines[rowIndex]?.kind;
      if (kind === "context" || kind === "del") oldRows.push(rowIndex);
      if (kind === "context" || kind === "add") newRows.push(rowIndex);
    }

    const oldTokens = oldRows.length
      ? highlightSource(
          oldRows.map((index) => lines[index]?.text ?? "").join("\n"),
          language,
        )
      : [];
    const newTokens = newRows.length
      ? highlightSource(
          newRows.map((index) => lines[index]?.text ?? "").join("\n"),
          language,
        )
      : [];
    const oldPosition = new Map(oldRows.map((row, index) => [row, index]));
    const newPosition = new Map(newRows.map((row, index) => [row, index]));

    for (const rowIndex of hunkRows) {
      const kind = lines[rowIndex]?.kind;
      const position =
        kind === "del" ? oldPosition.get(rowIndex) : newPosition.get(rowIndex);
      const tokens = kind === "del" ? oldTokens : newTokens;
      if (position !== undefined) result[rowIndex] = tokens[position] ?? [];
    }
    hunkRows = [];
  };

  lines.forEach((line, index) => {
    if (line.kind === "meta") {
      if (isHunkHeader(line.text)) flushHunk();
      return;
    }
    if (["context", "add", "del"].includes(line.kind)) {
      hunkRows.push(index);
    }
  });
  flushHunk();
  return result;
}
