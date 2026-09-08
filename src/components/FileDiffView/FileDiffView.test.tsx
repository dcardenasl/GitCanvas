// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  CommitDiff,
  CommitInfo,
  FileContent,
  FileDiff,
} from "../../bindings";

const getCommitDiff =
  vi.fn<(path: string, request: unknown) => Promise<CommitDiff>>();
const getFileContent =
  vi.fn<(path: string, request: unknown) => Promise<FileContent>>();

vi.mock("../../lib/ipc", () => ({
  getCommitDiff: (path: string, request: unknown) =>
    getCommitDiff(path, request),
  getFileContent: (path: string, request: unknown) =>
    getFileContent(path, request),
}));

const { FileDiffView } = await import("./FileDiffView");
const { useSession } = await import("../../state/session");

const COMMIT: CommitInfo = {
  id: "a".repeat(40),
  parents: ["b".repeat(40)],
  summary: "feat(site): add referrer policy header",
  message: "feat(site): add referrer policy header",
  author_name: "David Cardenas",
  author_email: "david@example.com",
  author_time: "1788815520",
  commit_time: "1788815520",
};

function file(overrides: Partial<FileDiff> = {}): FileDiff {
  return {
    path: "src/app.ts",
    old_path: null,
    change: "Modified",
    insertions: 2,
    deletions: 1,
    omitted: null,
    patch: "@@ -1,2 +1,3 @@\n const a = 1;\n-const b = 2;\n+const b = 3;\n",
    ...overrides,
  };
}

function diff(files: FileDiff[]): CommitDiff {
  return {
    commit_id: COMMIT.id,
    parent_id: COMMIT.parents[0] ?? null,
    files,
    insertions: 2,
    deletions: 1,
    is_merge: false,
  };
}

function renderView(path = "src/app.ts") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <FileDiffView repositoryPath="/tmp/repo" commit={COMMIT} path={path} />
    </QueryClientProvider>,
  );
}

function content(overrides: Partial<FileContent> = {}): FileContent {
  return {
    path: "src/app.ts",
    commit_id: COMMIT.id,
    lines: 3,
    bytes: "42",
    omitted: null,
    text: "const a = 1;\nconst b = 3;\nexport {};\n",
    ...overrides,
  };
}

beforeEach(() => {
  getCommitDiff.mockReset();
  getFileContent.mockReset();
  useSession.setState({
    selectedCommitId: COMMIT.id,
    selectedFilePath: "src/app.ts",
    expandedFilePath: null,
  });
});
afterEach(cleanup);

describe("FileDiffView", () => {
  it("renders the patch for the chosen file only", async () => {
    getCommitDiff.mockResolvedValue(
      diff([
        file(),
        file({ path: "other.ts", patch: "@@ -1 +1 @@\n+other\n" }),
      ]),
    );
    renderView();

    expect(await screen.findByText("const b = 3;")).toBeDefined();
    expect(screen.queryByText("other")).toBeNull();
  });

  it("returns to the graph when asked", async () => {
    getCommitDiff.mockResolvedValue(diff([file()]));
    renderView();

    await userEvent.click(
      await screen.findByRole("button", { name: "← Volver al graph" }),
    );

    expect(useSession.getState().selectedFilePath).toBeNull();
  });

  it("returns to the graph on Escape", async () => {
    getCommitDiff.mockResolvedValue(diff([file()]));
    renderView();
    await screen.findByText("const b = 3;");

    await userEvent.keyboard("{Escape}");

    expect(useSession.getState().selectedFilePath).toBeNull();
  });

  it("says so when the commit does not touch the file", async () => {
    getCommitDiff.mockResolvedValue(diff([file()]));
    renderView("does/not/exist.ts");

    expect(
      await screen.findByText("Este commit no modifica does/not/exist.ts."),
    ).toBeDefined();
  });

  it("explains a binary file instead of rendering an empty box", async () => {
    getCommitDiff.mockResolvedValue(
      diff([file({ path: "logo.png", omitted: "Binary", patch: null })]),
    );
    renderView("logo.png");

    expect(
      await screen.findByText(
        "Archivo binario. No hay diferencias de texto que mostrar.",
      ),
    ).toBeDefined();
  });

  it("loads an oversized diff only when it is asked for", async () => {
    getCommitDiff.mockResolvedValue(
      diff([
        file({
          path: "bundle.js",
          omitted: "TooLarge",
          patch: null,
          insertions: 5000,
          deletions: 100,
        }),
      ]),
    );
    renderView("bundle.js");

    const button = await screen.findByRole("button", {
      name: "Ver diff completo",
    });
    expect(getCommitDiff.mock.calls[0]?.[1]).toMatchObject({
      expand_path: null,
    });

    await userEvent.click(button);

    expect(useSession.getState().expandedFilePath).toBe("bundle.js");
    expect(getCommitDiff.mock.calls.at(-1)?.[1]).toMatchObject({
      expand_path: "bundle.js",
    });
  });

  it("reports a failure instead of an empty pane", async () => {
    getCommitDiff.mockRejectedValue(new Error("no se pudo leer el diff"));
    renderView();

    expect(await screen.findByRole("alert")).toBeDefined();
  });

  it("numbers the lines of a patch on both sides", async () => {
    getCommitDiff.mockResolvedValue(diff([file()]));
    renderView();
    await screen.findByText("const b = 3;");

    // The numbers come from the hunk header, so they are the file's, not the
    // row's position on screen.
    expect(screen.getAllByText("1").length).toBeGreaterThan(0);
  });

  it("shows the whole file when asked, not only the change", async () => {
    getCommitDiff.mockResolvedValue(diff([file()]));
    getFileContent.mockResolvedValue(content());
    renderView();
    await screen.findByText("const b = 3;");

    await userEvent.click(
      screen.getByRole("button", { name: "Archivo completo" }),
    );

    expect(await screen.findByText("export {};")).toBeDefined();
    expect(getFileContent.mock.calls[0]?.[1]).toMatchObject({
      path: "src/app.ts",
      expand: false,
    });
  });

  it("does not offer the whole file for one the commit deleted", async () => {
    getCommitDiff.mockResolvedValue(diff([file({ change: "Deleted" })]));
    renderView();
    await screen.findByText("const b = 3;");

    // There is nothing to read: offering it and then failing is worse than not
    // offering it.
    expect(
      screen.queryByRole("button", { name: "Archivo completo" }),
    ).toBeNull();
  });

  it("loads a large file only when asked", async () => {
    getCommitDiff.mockResolvedValue(diff([file()]));
    getFileContent.mockResolvedValue(
      content({ omitted: "TooLarge", text: null, lines: 9000 }),
    );
    renderView();
    await screen.findByText("const b = 3;");

    await userEvent.click(
      screen.getByRole("button", { name: "Archivo completo" }),
    );
    await userEvent.click(
      await screen.findByRole("button", { name: "Ver archivo completo" }),
    );

    expect(getFileContent.mock.calls.at(-1)?.[1]).toMatchObject({
      expand: true,
    });
  });

  it("toggles wrapping for long lines", async () => {
    getCommitDiff.mockResolvedValue(diff([file()]));
    const { container } = renderView();
    await screen.findByText("const b = 3;");

    expect(container.querySelector(".diff-viewer--wrap")).toBeNull();
    await userEvent.click(
      screen.getByRole("button", { name: "Ajustar líneas" }),
    );
    expect(container.querySelector(".diff-viewer--wrap")).not.toBeNull();
  });
});
