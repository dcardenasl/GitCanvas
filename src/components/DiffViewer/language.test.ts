import { describe, expect, it } from "vitest";

import {
  canHighlightPath,
  SYNTAX_HIGHLIGHT_CHARACTER_LIMIT,
  SYNTAX_HIGHLIGHT_LINE_LIMIT,
  syntaxLanguageForPath,
} from "./language";

describe("syntaxLanguageForPath", () => {
  it.each([
    ["README.md", "markdown"],
    ["src/view.PHP", "php"],
    ["src/app.ts", "typescript"],
    ["src/app.jsx", "jsx"],
    ["src/app.tsx", "tsx"],
    ["src/main.rs", "rust"],
    ["data.json", "json"],
    ["index.HTML", "markup"],
    ["styles.css", "css"],
  ] as const)("maps %s to %s", (path, language) => {
    expect(syntaxLanguageForPath(path)).toBe(language);
  });

  it.each(["Dockerfile", ".gitignore", "file", "file.", "file.toml"])(
    "leaves unsupported path %s as plain text",
    (path) => {
      expect(syntaxLanguageForPath(path)).toBeNull();
    },
  );

  it("enables highlighting through the line budget and rejects larger inputs", () => {
    expect(
      canHighlightPath(
        "src/app.ts",
        SYNTAX_HIGHLIGHT_LINE_LIMIT,
        SYNTAX_HIGHLIGHT_CHARACTER_LIMIT,
      ),
    ).toBe(true);
    expect(
      canHighlightPath("src/app.ts", SYNTAX_HIGHLIGHT_LINE_LIMIT + 1, 1),
    ).toBe(false);
    expect(
      canHighlightPath("src/app.ts", 1, SYNTAX_HIGHLIGHT_CHARACTER_LIMIT + 1),
    ).toBe(false);
    expect(canHighlightPath("Dockerfile", 1, 1)).toBe(false);
  });
});
