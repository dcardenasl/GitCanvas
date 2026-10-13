// @vitest-environment jsdom
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { parseHunks, parseWholeFile } from "./parse";
import { LineTable } from "./DiffViewer";

afterEach(cleanup);

describe("LineTable syntax highlighting", () => {
  it("highlights the complete source while preserving text and wrapping", async () => {
    const source = "const value = 'hello';";
    const { container } = render(
      <LineTable
        lines={parseWholeFile(source)}
        wrap
        path="src/app.ts"
        mode="file"
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
      <LineTable lines={lines} wrap path="src/app.ts" mode="diff" />,
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
        path="Dockerfile"
        mode="file"
      />,
    );

    expect(container.querySelector(".syntax-token--keyword")).toBeNull();
    expect(container.querySelector(".diff-line__text")?.textContent).toBe(
      "const value = 1;",
    );
  });
});
