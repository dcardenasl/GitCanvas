import ts from "typescript";
import { describe, expect, it } from "vitest";

/** Attributes whose string value is read by the user or by assistive tech. */
const TEXT_ATTRIBUTES = new Set([
  "aria-label",
  "aria-description",
  "aria-placeholder",
  "title",
  "placeholder",
  "alt",
]);

/** Visible text that is deliberately not translated, with the reason. */
const ALLOWED = new Set([
  // The brand name is the same in every language.
  "GitCanvas",
  // The shape of a GitHub token is a format, not prose.
  "ghp_…",
  // Git's own abbreviation for work in progress, in a decorative marker.
  "WIP",
]);

/** Every component source, loaded as text so no filesystem access is needed. */
const SOURCES = import.meta.glob<string>(
  ["../components/**/*.tsx", "!../components/**/*.test.tsx"],
  { query: "?raw", import: "default", eager: true },
);

/** Literal user-facing text found in a component's JSX. */
function literalsIn(path: string, source: string): string[] {
  const file = ts.createSourceFile(
    path,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const found: string[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isJsxText(node)) {
      const text = node.getText().trim();
      if (/\p{L}/u.test(text)) found.push(text);
    } else if (
      ts.isJsxAttribute(node) &&
      TEXT_ATTRIBUTES.has(node.name.getText()) &&
      node.initializer !== undefined &&
      ts.isStringLiteral(node.initializer)
    ) {
      found.push(node.initializer.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);

  return found.filter((text) => /\p{L}/u.test(text) && !ALLOWED.has(text));
}

describe("component text", () => {
  it("finds the components it is meant to guard", () => {
    expect(Object.keys(SOURCES).length).toBeGreaterThan(10);
  });

  it("is never a literal in the JSX: it comes from the catalogs", () => {
    const offenders = Object.entries(SOURCES).flatMap(([path, source]) =>
      literalsIn(path, source).map((text) => `${path}: ${text}`),
    );
    expect(offenders).toEqual([]);
  });
});
