// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  CommitDiff,
  RepositoryRefsSnapshot,
  WorktreeDiffPage,
  WorktreeSnapshot,
} from "../../bindings";
import { fileHistoryPage, fileHistoryRow } from "../../test/fileHistory";
import { createIpcMocks, renderWithQueryClient } from "../../test/test-utils";
import type { HistoryData } from "../../state/history";

const mockIpc = createIpcMocks([
  "getFileHistory",
  "getRepositoryRefs",
  "getWorktreeSnapshot",
  "getCommitDiff",
] as const);
const {
  getFileHistory,
  getRepositoryRefs,
  getWorktreeSnapshot,
  getCommitDiff,
} = mockIpc;

vi.mock("../../lib/ipc", () => mockIpc);

const { FileHistoryView } = await import("./FileHistoryView");
const { resetWorkspace, openTestProject, patchNavigation, activeNavigation } =
  await import("../../test/workspace");

const START = "a".repeat(40);
const NEW_HEAD = "e".repeat(40);
const ROOT = "/tmp/repo";

/** The graph as the shell hands it over: only the commits it has loaded. */
function graph(listed: string[]): HistoryData {
  const commits = listed.map((id) => fileHistoryRow(id).commit);
  return {
    commits,
    commitIndexById: new Map(
      commits.map((commit, index) => [commit.id, index]),
    ),
    rows: [],
    maxLanes: 0,
    hasNextPage: false,
    isFetchingNextPage: false,
    isLoading: false,
    error: null,
    fetchNextPage: () => undefined,
  };
}

function refs(head: string | null): RepositoryRefsSnapshot {
  return {
    branches: [],
    tags: [],
    head,
    head_reference: null,
    roots: [],
  };
}

/** A worktree page listing the given unstaged paths, shaped as the engine returns it. */
function unstaged(paths: string[]): WorktreeDiffPage {
  const files = paths.map((path) => ({
    path,
    old_path: null,
    change: "Modified" as const,
    insertions: 1,
    deletions: 0,
    omitted: null,
  }));
  return {
    side: "unstaged",
    revision: "revision",
    files,
    total_files: files.length,
    next_cursor: null,
    insertions: files.length,
    deletions: 0,
  };
}

function snapshot(unstagedPaths: string[]): WorktreeSnapshot {
  return {
    revision: "revision",
    staged: { ...unstaged([]), side: "staged" },
    unstaged: unstaged(unstagedPaths),
  };
}

function openHistory(
  overrides: Partial<{
    startCommitId: string;
    followsHead: boolean;
    selectedCommitId: string | null;
    stale: boolean;
  }> = {},
): void {
  patchNavigation({
    fileHistory: {
      path: "src/app.ts",
      startCommitId: START,
      selectedCommitId: null,
      stale: false,
      followsHead: false,
      ...overrides,
    },
  });
}

function renderView(history: HistoryData) {
  return renderWithQueryClient(<FileHistoryView history={history} />);
}

afterEach(cleanup);

beforeEach(() => {
  resetWorkspace();
  openTestProject({ path: ROOT, name: "repo" });
  getFileHistory.mockReset();
  getRepositoryRefs.mockReset();
  getWorktreeSnapshot.mockReset();
  getCommitDiff.mockReset();
  getRepositoryRefs.mockResolvedValue(refs(START));
  getWorktreeSnapshot.mockResolvedValue(snapshot([]));
  getCommitDiff.mockResolvedValue({
    commit_id: START,
    parent_id: null,
    files: [],
    insertions: 0,
    deletions: 0,
    is_merge: false,
  } satisfies CommitDiff);
});

describe("file history view", () => {
  it("lists each commit with what it says about the file", async () => {
    getFileHistory.mockResolvedValue(
      fileHistoryPage(
        [
          fileHistoryRow("b", {
            change: "added",
            renamed_from: "src/old.ts",
          }),
          fileHistoryRow("c", {
            is_merge: true,
            lineage: "rename_limit",
          }),
        ],
        null,
      ),
    );
    openHistory();
    renderView(graph(["b", "c"]));

    const list = await screen.findByRole("list", {
      name: "Commits que cambiaron src/app.ts",
    });
    const rows = within(list).getAllByRole("button", { pressed: false });
    expect(rows).toHaveLength(2);
    expect(screen.getByText("Renombrado desde src/old.ts")).toBeTruthy();
    expect(
      screen.getByText("Fusión: comparada con su primer padre"),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "El seguimiento de renombrados se detuvo aquí: se alcanzó el límite de renombrados.",
      ),
    ).toBeTruthy();
  });

  it("shows a picked commit's change and jumps to it in the graph when it is listed there", async () => {
    getFileHistory.mockResolvedValue(
      fileHistoryPage([fileHistoryRow("b"), fileHistoryRow("c")], null),
    );
    openHistory();
    const { container } = renderView(graph(["b", "c"]));

    await userEvent.click(
      await screen.findByRole("button", { name: /change b/ }),
    );
    expect(activeNavigation().fileHistory?.selectedCommitId).toBe(
      "b".repeat(40),
    );
    expect(container.querySelector(".file-history__detail")).not.toBeNull();

    await userEvent.click(
      screen.getByRole("button", { name: "Mostrar en el gráfico" }),
    );
    expect(activeNavigation().fileHistory).toBeNull();
    expect(activeNavigation().selection).toEqual({
      kind: "commit",
      commitId: "b".repeat(40),
      filePath: null,
    });
    expect(activeNavigation().revealCommitId).toBe("b".repeat(40));
  });

  it("explains that a picked commit outside the graph scope cannot be shown there", async () => {
    getFileHistory.mockResolvedValue(
      fileHistoryPage([fileHistoryRow("b")], null),
    );
    openHistory({ selectedCommitId: "b".repeat(40) });
    renderView(graph([]));

    expect(
      await screen.findByText(
        "Este commit está fuera del alcance actual del gráfico, así que no se puede mostrar allí.",
      ),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Mostrar en el gráfico" }),
    ).toBeNull();
  });

  it("moves focus between commits with the arrow, Home and End keys", async () => {
    getFileHistory.mockResolvedValue(
      fileHistoryPage(
        [fileHistoryRow("b"), fileHistoryRow("c"), fileHistoryRow("d")],
        null,
      ),
    );
    openHistory();
    renderView(graph(["b", "c", "d"]));

    const list = await screen.findByRole("list", {
      name: "Commits que cambiaron src/app.ts",
    });
    const rows = within(list).getAllByRole("button", { pressed: false });
    rows[0]?.focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(document.activeElement?.textContent).toContain("change c");
    await userEvent.keyboard("{End}");
    expect(document.activeElement?.textContent).toContain("change d");
    await userEvent.keyboard("{ArrowDown}");
    expect(document.activeElement?.textContent).toContain("change d");
    await userEvent.keyboard("{Home}");
    expect(document.activeElement?.textContent).toContain("change b");
  });

  it("goes back to the graph with a single action", async () => {
    getFileHistory.mockResolvedValue(
      fileHistoryPage([fileHistoryRow("b")], null),
    );
    openHistory();
    renderView(graph(["b"]));

    await userEvent.click(
      await screen.findByRole("button", { name: "Volver al gráfico" }),
    );
    expect(activeNavigation().fileHistory).toBeNull();
  });

  it("offers a refresh when HEAD moved, and restarts from the new HEAD", async () => {
    getFileHistory.mockResolvedValue(
      fileHistoryPage([fileHistoryRow("b")], null),
    );
    getRepositoryRefs.mockResolvedValue(refs(NEW_HEAD));
    openHistory({ followsHead: true });
    renderView(graph(["b"]));

    await userEvent.click(
      await screen.findByRole("button", { name: "Actualizar" }),
    );
    expect(activeNavigation().fileHistory).toEqual({
      path: "src/app.ts",
      startCommitId: NEW_HEAD,
      selectedCommitId: null,
      stale: false,
      followsHead: true,
    });
  });

  it("loads the next page only when the engine stopped at a work limit", async () => {
    getFileHistory
      .mockResolvedValueOnce(
        fileHistoryPage([fileHistoryRow("b")], "cursor-1", {
          truncation: "work_limit",
        }),
      )
      .mockResolvedValueOnce(fileHistoryPage([fileHistoryRow("c")], null));
    openHistory();
    renderView(graph(["b", "c"]));

    expect(
      await screen.findByText(
        "El historial se detuvo al alcanzar un límite de trabajo. Carga más para continuar.",
      ),
    ).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Cargar más" }));
    expect(getFileHistory).toHaveBeenLastCalledWith(
      ROOT,
      expect.objectContaining({ cursor: "cursor-1" }),
    );
  });

  it("opens the local changes of the file when it has any", async () => {
    getFileHistory.mockResolvedValue(
      fileHistoryPage([fileHistoryRow("b")], null),
    );
    getWorktreeSnapshot.mockResolvedValue(snapshot(["src/app.ts"]));
    openHistory();
    renderView(graph(["b"]));

    await userEvent.click(
      await screen.findByRole("button", { name: "Cambios locales" }),
    );
    expect(activeNavigation().fileHistory).toBeNull();
    expect(activeNavigation().selection).toEqual({
      kind: "worktree",
      side: "unstaged",
      filePath: "src/app.ts",
    });
  });
});
