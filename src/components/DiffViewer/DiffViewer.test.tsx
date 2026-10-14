// @vitest-environment jsdom
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { parseHunks, parseWholeFile } from "./parse";
import { LineTable } from "./DiffViewer";

vi.mock("./highlighter", async () => ({
  syntaxHighlighter: (await import("../../test/inlineHighlighter"))
    .inlineHighlighter,
}));

afterEach(cleanup);

describe("LineTable syntax highlighting", () => {
  it("highlights the complete source while preserving text and wrapping", async () => {
    const source = "const value = 'hello';";
    const { container } = render(
      <LineTable
        lines={parseWholeFile(source)}
        wrap
        highlight={{ path: "src/app.ts", mode: "source" }}
      />,
    );

    await waitFor(() => {
      expect(container.querySelector(".syntax-token--keyword")).not.toBeNull();
      expect(container.querySelector(".syntax-token--string")).not.toBeNull();
    });
    expect(container.querySelector(".diff-viewer--wrap")).not.toBeNull();
    expect(container.querySelector(".diff-line__text")?.textContent).toBe(
      source,
    );
  });

  it("uses syntax colors for added and deleted diff rows", async () => {
    const lines = parseHunks(
      "@@ -1 +1 @@\n-const value = 1;\n+const value = 'hello';",
    );
    const { container } = render(
      <LineTable
        lines={lines}
        wrap
        highlight={{ path: "src/app.ts", mode: "diff" }}
      />,
    );

    await waitFor(() => {
      expect(
        container.querySelector(".diff-line--del .syntax-token--number"),
      ).not.toBeNull();
      expect(
        container.querySelector(".diff-line--add .syntax-token--string"),
      ).not.toBeNull();
    });
  });

  it("keeps unsupported files in plain text", () => {
    const { container } = render(
      <LineTable
        lines={parseWholeFile("const value = 1;")}
        wrap
        highlight={{ path: "Dockerfile", mode: "source" }}
      />,
    );

    expect(container.querySelector(".syntax-token--keyword")).toBeNull();
    expect(container.querySelector(".diff-line__text")?.textContent).toBe(
      "const value = 1;",
    );
  });

  it("stays plain text when no highlight target is given", () => {
    const { container } = render(
      <LineTable lines={parseWholeFile("const value = 1;")} wrap />,
    );

    expect(container.querySelector(".syntax-token--keyword")).toBeNull();
  });
});
