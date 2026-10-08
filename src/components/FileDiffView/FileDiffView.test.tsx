// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  CommitDiff,
  CommitInfo,
  FileContent,
  FileDiff,
  WorktreeSnapshot,
} from "../../bindings";
import {
  createIpcMocks,
  createTestQueryClient,
  renderWithQueryClient,
} from "../../test/test-utils";

const mockIpc = createIpcMocks([
  "getCommitDiff",
  "getFileContent",
  "getWorktreeSnapshot",
  "getWorktreeFileDiff",
  "getWorktreeFileContent",
] as const);
const {
  getCommitDiff,
  getFileContent,
  getWorktreeSnapshot,
  getWorktreeFileDiff,
  getWorktreeFileContent,
} = mockIpc;

vi.mock("../../lib/ipc", () => mockIpc);

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

function worktreeSnapshot(files: FileDiff[] = []): WorktreeSnapshot {
  const summaries = files.map((entry) => ({
    path: entry.path,
    old_path: entry.old_path,
    change: entry.change,
    insertions: entry.insertions,
    deletions: entry.deletions,
    omitted: entry.omitted,
  }));
  return {
    revision: "revision",
    staged: {
      side: "staged",
      revision: "revision",
      files: [],
      total_files: 0,
      next_cursor: null,
      insertions: 0,
      deletions: 0,
    },
    unstaged: {
      side: "unstaged",
      revision: "revision",
      files: summaries,
      total_files: summaries.length,
      next_cursor: null,
      insertions: 2,
      deletions: 1,
    },
  };
}

function renderView(
  path = "src/app.ts",
  worktree?: { side: "staged" | "unstaged" },
  snapshot = false,
) {
  return renderWithQueryClient(
    <FileDiffView
      repositoryPath="/tmp/repo"
      path={path}
      {...(worktree === undefined
        ? { commit: COMMIT, snapshot }
        : { worktree })}
    />,
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
  getWorktreeSnapshot.mockReset();
  getWorktreeFileDiff.mockReset();
  getWorktreeFileContent.mockReset();
  useSession.setState({
    selection: { kind: "commit", commitId: COMMIT.id, filePath: "src/app.ts" },
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

    expect(await screen.findByText("const b = 3;")).toBeInstanceOf(HTMLElement);
    expect(screen.queryByText("other")).toBeNull();
  });

  it("opens an unchanged commit-tree file directly as a bounded snapshot", async () => {
    getCommitDiff.mockResolvedValue(diff([]));
    getFileContent.mockResolvedValue(content({ path: "src/stable.ts" }));
    renderView("src/stable.ts", undefined, true);

    expect(await screen.findByText("export {};")).toBeInstanceOf(HTMLElement);
    expect(screen.queryByRole("button", { name: "Cambios" })).toBeNull();
    expect(getFileContent.mock.calls[0]?.[1]).toMatchObject({
      commit_id: COMMIT.id,
      path: "src/stable.ts",
      expand: false,
    });
    expect(getCommitDiff).toHaveBeenCalledWith(
      "/tmp/repo",
      expect.objectContaining({ commit_id: COMMIT.id, file_path: null }),
    );
  });

  it("switches to the diff if the commit tree opens a file before the diff arrives", async () => {
    getCommitDiff.mockResolvedValue(diff([file({ path: "src/stable.ts" })]));
    getFileContent.mockResolvedValue(content({ path: "src/stable.ts" }));
    useSession.setState({
      selection: {
        kind: "commit",
        commitId: COMMIT.id,
        filePath: "src/stable.ts",
        fileMode: "snapshot",
      },
    });
    renderView("src/stable.ts", undefined, true);

    expect(await screen.findByText("const b = 3;")).toBeInstanceOf(HTMLElement);
    expect(useSession.getState().selection).toEqual({
      kind: "commit",
      commitId: COMMIT.id,
      filePath: "src/stable.ts",
    });
  });

  it("returns to the graph when asked", async () => {
    getCommitDiff.mockResolvedValue(diff([file()]));
    renderView();

    await userEvent.click(
      await screen.findByRole("button", { name: "← Volver al graph" }),
    );

    expect(useSession.getState().selection).toMatchObject({ filePath: null });
  });

  it("returns to the graph on Escape", async () => {
    getCommitDiff.mockResolvedValue(diff([file()]));
    renderView();
    await screen.findByText("const b = 3;");

    await userEvent.keyboard("{Escape}");

    expect(useSession.getState().selection).toMatchObject({ filePath: null });
  });

  it("says so when the commit does not touch the file", async () => {
    getCommitDiff.mockResolvedValue(diff([file()]));
    renderView("does/not/exist.ts");

    expect(
      await screen.findByText("Este commit no modifica does/not/exist.ts."),
    ).toBeInstanceOf(HTMLElement);
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
    ).toBeInstanceOf(HTMLElement);
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
      file_path: "bundle.js",
      expand_path: null,
    });

    await userEvent.click(button);

    expect(useSession.getState().expandedFilePath).toBe("bundle.js");
    expect(getCommitDiff.mock.calls.at(-1)?.[1]).toMatchObject({
      file_path: "bundle.js",
      expand_path: "bundle.js",
    });
  });

  it("reports a failure instead of an empty pane", async () => {
    getCommitDiff.mockRejectedValue(new Error("no se pudo leer el diff"));
    renderView();

    expect(await screen.findByRole("alert")).toBeInstanceOf(HTMLElement);
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

    expect(await screen.findByText("export {};")).toBeInstanceOf(HTMLElement);
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
    renderView();
    await screen.findByText("const b = 3;");
    const wrap = screen.getByRole("button", { name: "Ajustar líneas" });

    expect(wrap.getAttribute("aria-pressed")).toBe("false");
    await userEvent.click(wrap);
    expect(wrap.getAttribute("aria-pressed")).toBe("true");
  });

  it("renders an unstaged local file", async () => {
    getWorktreeSnapshot.mockResolvedValue(
      worktreeSnapshot([file({ path: "local.ts" })]),
    );
    getWorktreeFileDiff.mockResolvedValue({
      side: "unstaged",
      revision: "revision",
      file: file({ path: "local.ts" }),
    });
    useSession.setState({
      selection: { kind: "worktree", side: "unstaged", filePath: "local.ts" },
    });

    renderView("local.ts", { side: "unstaged" });

    expect(await screen.findByText("const b = 3;")).toBeInstanceOf(HTMLElement);
    expect(screen.getByText(/cambios locales · sin preparar/)).toBeInstanceOf(
      HTMLElement,
    );
    expect(getWorktreeFileDiff.mock.calls[0]?.[1]).toMatchObject({
      side: "unstaged",
      expected_revision: "revision",
    });
  });

  describe("when the local file changes while it is open", () => {
    const local = () => file({ path: "local.ts" });

    function open() {
      useSession.setState({
        selection: { kind: "worktree", side: "unstaged", filePath: "local.ts" },
      });
      renderView("local.ts", { side: "unstaged" });
    }

    it("reads it again under the new revision instead of closing", async () => {
      getWorktreeSnapshot.mockResolvedValueOnce(worktreeSnapshot([local()]));
      // The first read races an edit and is refused as stale.
      getWorktreeFileDiff.mockRejectedValueOnce(
        Object.assign(new Error("repository revision is stale"), {
          kind: "WorktreeChanged",
        }),
      );
      getWorktreeSnapshot.mockResolvedValue({
        ...worktreeSnapshot([local()]),
        revision: "newer",
      });
      getWorktreeFileDiff.mockResolvedValue({
        side: "unstaged",
        revision: "newer",
        file: local(),
      });
      open();

      expect(await screen.findByText("const b = 3;")).toBeInstanceOf(
        HTMLElement,
      );
      expect(useSession.getState().selection).toEqual({
        kind: "worktree",
        side: "unstaged",
        filePath: "local.ts",
      });
      expect(getWorktreeFileDiff.mock.calls.at(-1)?.[1]).toMatchObject({
        expected_revision: "newer",
      });
    });

    it("keeps the selection and reports when the re-read finds the file gone", async () => {
      getWorktreeSnapshot.mockResolvedValueOnce(worktreeSnapshot([local()]));
      getWorktreeFileDiff.mockRejectedValueOnce(
        Object.assign(new Error("repository revision is stale"), {
          kind: "WorktreeChanged",
        }),
      );
      // By the next revision the file has been deleted.
      getWorktreeSnapshot.mockResolvedValue({
        ...worktreeSnapshot([]),
        revision: "newer",
      });
      getWorktreeFileDiff.mockRejectedValue(
        Object.assign(new Error("local.ts"), {
          kind: "WorktreeFileUnavailable",
        }),
      );
      open();

      expect(await screen.findByRole("alert")).toBeInstanceOf(HTMLElement);
      expect(useSession.getState().selection).toMatchObject({
        kind: "worktree",
        filePath: "local.ts",
      });
    });

    it("reports when the file is deleted while it is showing", async () => {
      // The real order of events: it is on screen, then the watcher reports a
      // change and every local query is invalidated at once. The open file's
      // read is repeated with the old revision and refused; the snapshot comes
      // back with a new one under which the file no longer exists.
      getWorktreeSnapshot.mockResolvedValueOnce(worktreeSnapshot([local()]));
      getWorktreeFileDiff.mockResolvedValueOnce({
        side: "unstaged",
        revision: "revision",
        file: local(),
      });
      useSession.setState({
        selection: { kind: "worktree", side: "unstaged", filePath: "local.ts" },
      });
      const client = createTestQueryClient();
      renderWithQueryClient(
        <FileDiffView
          repositoryPath="/tmp/repo"
          path="local.ts"
          worktree={{ side: "unstaged" }}
        />,
        client,
      );
      expect(await screen.findByText("const b = 3;")).toBeInstanceOf(
        HTMLElement,
      );

      getWorktreeSnapshot.mockResolvedValue({
        ...worktreeSnapshot([]),
        revision: "newer",
      });
      getWorktreeFileDiff.mockImplementation((_path, request) =>
        Promise.reject(
          Object.assign(new Error("gone"), {
            kind:
              (request as { expected_revision: string }).expected_revision ===
              "newer"
                ? "WorktreeFileUnavailable"
                : "WorktreeChanged",
          }),
        ),
      );
      await client.invalidateQueries({ queryKey: ["worktree", "/tmp/repo"] });
      await client.invalidateQueries({
        queryKey: ["worktree-file-diff", "/tmp/repo"],
      });

      expect(await screen.findByRole("alert")).toBeInstanceOf(HTMLElement);
      expect(useSession.getState().selection).toMatchObject({
        kind: "worktree",
        filePath: "local.ts",
      });
    });

    it("keeps the selection and shows an unavailable-file error", async () => {
      getWorktreeSnapshot.mockResolvedValue(worktreeSnapshot([local()]));
      getWorktreeFileDiff.mockRejectedValue(
        Object.assign(new Error("local.ts"), {
          kind: "WorktreeFileUnavailable",
        }),
      );
      open();

      expect(await screen.findByRole("alert")).toBeInstanceOf(HTMLElement);
      expect(useSession.getState().selection).toMatchObject({
        kind: "worktree",
        filePath: "local.ts",
      });
    });
  });
});
