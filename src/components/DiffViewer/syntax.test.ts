import { describe, expect, it } from "vitest";

import { SYNTAX_LANGUAGES } from "./language";
import { parseHunks } from "./parse";
import { highlightDiff, highlightSource } from "./syntax";

function sourceOf(
  lines: readonly (readonly { readonly text: string }[])[],
): string {
  return lines
    .map((line) => line.map((segment) => segment.text).join(""))
    .join("\n");
}

describe("syntax highlighting", () => {
  it("has a working grammar for every registered language", () => {
    for (const { id } of SYNTAX_LANGUAGES) {
      expect(sourceOf(highlightSource("a\nb", id))).toBe("a\nb");
    }
  });

  it.each([
    ["# Heading", "markdown", "heading"],
    ["<?php echo 'value';", "php", "string"],
    ["const value: number = 1;", "typescript", "keyword"],
    ["const value = 1;", "javascript", "keyword"],
    ["fn main() {}", "rust", "keyword"],
    ['{"key": true}', "json", "property"],
    ['<div class="x">', "markup", "tag"],
    ["a { color: red; }", "css", "property"],
    ["const view = <div />;", "jsx", "tag"],
    ["const view = <div />;", "tsx", "tag"],
  ] as const)("highlights %s using %s", (source, language, category) => {
    const lines = highlightSource(source, language);
    expect(sourceOf(lines)).toBe(source);
    expect(
      lines.flat().some((segment) => segment.categories.includes(category)),
    ).toBe(true);
  });

  it("preserves source text and carries multiline comment scopes", () => {
    const source = "/* opening\nstill comment */ const ready = true;";
    const lines = highlightSource(source, "javascript");

    expect(sourceOf(lines)).toBe(source);
    expect(
      lines[0]?.some((segment) => segment.categories.includes("comment")),
    ).toBe(true);
    expect(
      lines[1]?.some((segment) => segment.categories.includes("comment")),
    ).toBe(true);
    expect(
      lines[1]?.some((segment) => segment.categories.includes("keyword")),
    ).toBe(true);
  });

  it("uses old syntax for deleted rows and new syntax for additions", () => {
    const rows = parseHunks(
      "@@ -1 +1 @@\n-const value = 1;\n+const value = 'new';",
    );
    const highlighted = highlightDiff(rows, "javascript");
    const deleted = highlighted[1] ?? [];
    const added = highlighted[2] ?? [];

    expect(sourceOf(highlighted.map((segments) => segments ?? []))).toBe(
      "\nconst value = 1;\nconst value = 'new';",
    );
    expect(
      deleted.some((segment) => segment.categories.includes("number")),
    ).toBe(true);
    expect(added.some((segment) => segment.categories.includes("string"))).toBe(
      true,
    );
  });

  it("resets lexical state between independent hunks", () => {
    const rows = parseHunks(
      "@@ -1 +1 @@\n+const first = 1;\n@@ -20 +20 @@\n+const second = 'text';",
    );

    const highlighted = highlightDiff(rows, "typescript");
    expect(
      highlighted[1]?.some((segment) => segment.categories.includes("number")),
    ).toBe(true);
    expect(
      highlighted[3]?.some((segment) => segment.categories.includes("string")),
    ).toBe(true);
  });
});

describe("highlightDiff rows", () => {
  it("leaves hunk headers and notices untokenized and keeps row positions", () => {
    const rows = parseHunks(
      "@@ -1,2 +1,2 @@\n const a = 1;\n-const b = 2;\n+const b = 3;\n\\ No newline at end of file",
    );
    const highlighted = highlightDiff(rows, "typescript");

    expect(highlighted).toHaveLength(rows.length);
    expect(highlighted[0]).toBeNull();
    expect(highlighted.at(-1)).toBeNull();
    expect(highlighted[1]).not.toBeNull();
  });

  it("treats context as both sides so open scopes carry across it", () => {
    const rows = parseHunks("@@ -1,3 +1,3 @@\n /* open\n-old\n+new\n close */");
    const highlighted = highlightDiff(rows, "javascript");

    expect(
      highlighted[2]?.every((segment) =>
        segment.categories.includes("comment"),
      ),
    ).toBe(true);
    expect(
      highlighted[3]?.every((segment) =>
        segment.categories.includes("comment"),
      ),
    ).toBe(true);
  });

  it("handles a hunk with only additions", () => {
    const rows = parseHunks("@@ -0,0 +1,2 @@\n+let a = 1;\n+let b = 2;");
    const highlighted = highlightDiff(rows, "javascript");

    expect(highlighted[1]?.length).toBeGreaterThan(0);
    expect(highlighted[2]?.length).toBeGreaterThan(0);
  });
});
