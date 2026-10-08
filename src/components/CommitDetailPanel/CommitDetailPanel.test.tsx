// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CommitDiff, CommitInfo, FileDiff } from "../../bindings";
import { createIpcMocks, renderWithQueryClient } from "../../test/test-utils";

const mockIpc = createIpcMocks(["getCommitDiff", "getCommitTreePage"] as const);
const { getCommitDiff, getCommitTreePage } = mockIpc;

vi.mock("../../lib/ipc", () => mockIpc);

const { CommitDetailPanel } = await import("./CommitDetailPanel");
const { useSession } = await import("../../state/session");
const { useFileListPreferences } =
  await import("../../state/fileListPreferences");

const COMMIT: CommitInfo = {
  id: "a".repeat(40),
  parents: ["b".repeat(40)],
  summary: "feat(site): add referrer policy header",
  message: "feat(site): add referrer policy header\n\nMore detail here.",
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
    insertions: 3,
    deletions: 1,
    omitted: null,
    patch: "@@ -1 +1 @@\n-a\n+b\n",
    ...overrides,
  };
}

function diff(overrides: Partial<CommitDiff> = {}): CommitDiff {
  return {
    commit_id: COMMIT.id,
    parent_id: COMMIT.parents[0] ?? null,
    files: [],
    insertions: 0,
    deletions: 0,
    is_merge: false,
    ...overrides,
  };
}

function renderPanel() {
  return renderWithQueryClient(
    <CommitDetailPanel repositoryPath="/tmp/repo" commit={COMMIT} />,
  );
}

beforeEach(() => {
  getCommitDiff.mockReset();
  getCommitTreePage.mockReset();
  localStorage.removeItem("gitcanvas.file-list-view");
  useFileListPreferences.setState({ view: "path" });
  useSession.setState({
    selection: { kind: "commit", commitId: COMMIT.id, filePath: null },
    expandedFilePath: null,
  });
});
afterEach(cleanup);

describe("CommitDetailPanel", () => {
  it("shows the commit identity and body", async () => {
    getCommitDiff.mockResolvedValue(diff());
    renderPanel();

    expect(screen.getByText(COMMIT.summary)).toBeInstanceOf(HTMLElement);
    expect(
      screen.getByText("More detail here.", { exact: false }),
    ).toBeInstanceOf(HTMLElement);
    expect(
      (await screen.findByText(/archivos modificados/)).textContent,
    ).toMatch(/\d+ archivos? modificados/);
  });

  it("says when a merge diff only covers the first parent", async () => {
    getCommitDiff.mockResolvedValue(diff({ is_merge: true }));
    renderPanel();

    expect(
      await screen.findByText(
        "Commit de merge: se muestran los cambios contra el primer padre.",
      ),
    ).toBeInstanceOf(HTMLElement);
  });

  it("lists the changed files as choices, not as inline diffs", async () => {
    getCommitDiff.mockResolvedValue(
      diff({
        files: [file(), file({ path: "README.md", change: "Added" })],
        insertions: 6,
        deletions: 1,
      }),
    );
    renderPanel();

    const list = await screen.findByRole("list", {
      name: "Archivos modificados",
    });
    expect(list).toBeInstanceOf(HTMLElement);
    expect(within(list).getAllByRole("button")).toHaveLength(2);

    // The panel is navigation now; the patch belongs to the centre view.
    expect(screen.queryByText("+b")).toBeNull();
  });

  it("opens the chosen file in the centre panel", async () => {
    getCommitDiff.mockResolvedValue(diff({ files: [file()] }));
    renderPanel();

    const list = await screen.findByRole("list", {
      name: "Archivos modificados",
    });
    await userEvent.click(within(list).getByRole("button"));

    expect(useSession.getState().selection).toEqual({
      kind: "commit",
      commitId: COMMIT.id,
      filePath: "src/app.ts",
    });
  });

  it("marks a file the engine withheld instead of showing a line count", async () => {
    getCommitDiff.mockResolvedValue(
      diff({
        files: [
          file({ path: "logo.png", omitted: "Binary", patch: null }),
          file({ path: "bundle.js", omitted: "TooLarge", patch: null }),
        ],
      }),
    );
    renderPanel();

    expect(await screen.findByText("binario")).toBeInstanceOf(HTMLElement);
    expect(screen.getByText("grande")).toBeInstanceOf(HTMLElement);
  });

  it("leads with the file name and follows with its directory", async () => {
    // A path truncated from the left cuts the directory mid-token and runs it
    // into the name; leading with the name keeps it readable at any width.
    getCommitDiff.mockResolvedValue(
      diff({ files: [file({ path: "src/components/CommitTable/index.ts" })] }),
    );
    renderPanel();

    const list = await screen.findByRole("list", {
      name: "Archivos modificados",
    });
    const row = within(list).getByRole("button");
    const text = row.textContent;

    expect(text.indexOf("index.ts")).toBeLessThan(
      text.indexOf("src/components/CommitTable"),
    );
    // The directory carries no trailing slash now that it follows the name.
    expect(text).not.toContain("CommitTable/index.ts");
  });

  it("switches to a collapsible directory tree without changing file navigation", async () => {
    getCommitDiff.mockResolvedValue(
      diff({
        files: [
          file({ path: "src/components/CommitTable/index.ts" }),
          file({ path: "README.md" }),
        ],
      }),
    );
    renderPanel();

    await screen.findByRole("list", { name: "Archivos modificados" });
    await userEvent.click(screen.getByRole("button", { name: "Árbol" }));
    expect(useFileListPreferences.getState().view).toBe("tree");
    expect(localStorage.getItem("gitcanvas.file-list-view")).toBe("tree");
    const list = await screen.findByRole("list", {
      name: "Archivos modificados",
    });
    const directory = within(list).getByRole("button", {
      name: "src, 1 archivo modificado",
    });
    expect(directory.getAttribute("aria-expanded")).toBe("true");
    expect(within(list).getByText("index.ts")).toBeInstanceOf(HTMLElement);

    await userEvent.click(directory);
    expect(directory.getAttribute("aria-expanded")).toBe("false");
    expect(within(list).queryByText("index.ts")).toBeNull();

    await userEvent.click(directory);
    await userEvent.click(within(list).getByText("index.ts"));
    expect(useSession.getState().selection).toEqual({
      kind: "commit",
      commitId: COMMIT.id,
      filePath: "src/components/CommitTable/index.ts",
    });
  });

  it("loads all files lazily and opens unchanged files as commit snapshots", async () => {
    getCommitDiff.mockResolvedValue(diff({ files: [file()] }));
    getCommitTreePage
      .mockResolvedValueOnce({
        commit_id: COMMIT.id,
        directory_path: null,
        entries: [{ name: "src", path: "src", kind: "Directory" }],
        next_offset: null,
      })
      .mockResolvedValueOnce({
        commit_id: COMMIT.id,
        directory_path: "src",
        entries: [
          { name: "app.ts", path: "src/app.ts", kind: "File" },
          { name: "stable.ts", path: "src/stable.ts", kind: "File" },
        ],
        next_offset: null,
      });
    renderPanel();

    await userEvent.click(
      await screen.findByRole("checkbox", { name: "Ver todos los archivos" }),
    );
    expect(useFileListPreferences.getState().view).toBe("tree");
    const tree = await screen.findByRole("list", {
      name: "Todos los archivos del commit",
    });
    const directory = within(tree).getByRole("button", {
      name: "src, carpeta, 1 archivo con cambios",
    });
    await userEvent.click(directory);

    const unchanged = await screen.findByRole("button", {
      name: /stable\.ts/,
    });
    expect(
      within(unchanged).getByLabelText("Sin cambios en este commit"),
    ).toBeInstanceOf(HTMLElement);
    await userEvent.click(unchanged);
    expect(useSession.getState().selection).toEqual({
      kind: "commit",
      commitId: COMMIT.id,
      filePath: "src/stable.ts",
      fileMode: "snapshot",
    });
    expect(getCommitTreePage).toHaveBeenNthCalledWith(
      2,
      "/tmp/repo",
      expect.objectContaining({ directory_path: "src", offset: 0 }),
    );
  });

  it("loads large commit directories one bounded page at a time", async () => {
    getCommitDiff.mockResolvedValue(diff());
    getCommitTreePage
      .mockResolvedValueOnce({
        commit_id: COMMIT.id,
        directory_path: null,
        entries: Array.from({ length: 200 }, (_, index) => ({
          name: `file-${String(index).padStart(3, "0")}.txt`,
          path: `file-${String(index).padStart(3, "0")}.txt`,
          kind: "File" as const,
        })),
        next_offset: 200,
      })
      .mockResolvedValueOnce({
        commit_id: COMMIT.id,
        directory_path: null,
        entries: [{ name: "zz-last.txt", path: "zz-last.txt", kind: "File" }],
        next_offset: null,
      });
    renderPanel();

    await userEvent.click(
      await screen.findByRole("checkbox", { name: "Ver todos los archivos" }),
    );
    expect(await screen.findByText("file-000.txt")).toBeInstanceOf(HTMLElement);
    await userEvent.click(
      await screen.findByRole("button", { name: "Cargar más entradas" }),
    );

    expect(await screen.findByText("zz-last.txt")).toBeInstanceOf(HTMLElement);
    expect(getCommitTreePage).toHaveBeenNthCalledWith(
      2,
      "/tmp/repo",
      expect.objectContaining({ offset: 200 }),
    );
    expect(
      screen.queryByRole("button", { name: "Cargar más entradas" }),
    ).toBeNull();
  }, 60_000);

  it("labels each change kind for assistive technology", async () => {
    getCommitDiff.mockResolvedValue(
      diff({ files: [file({ change: "Deleted", path: "gone.txt" })] }),
    );
    renderPanel();

    expect(await screen.findByLabelText("Eliminado")).toBeInstanceOf(
      HTMLElement,
    );
  });

  it("reports a diff failure instead of showing nothing", async () => {
    getCommitDiff.mockRejectedValue(new Error("no se pudo leer el diff"));
    renderPanel();

    expect(await screen.findByRole("alert")).toBeInstanceOf(HTMLElement);
  });
});
