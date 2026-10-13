import { describe, expect, it } from "vitest";

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
