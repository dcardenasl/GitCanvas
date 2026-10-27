// @vitest-environment jsdom
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { HistoryPage } from "../../bindings";
import { createIpcMocks, renderWithQueryClient } from "../../test/test-utils";

const mockIpc = createIpcMocks([
  "getCommits",
  "getWorktreeSnapshot",
  "getRepositoryRefs",
  "getRepositoryWorktrees",
] as const);
const { getCommits, getWorktreeSnapshot } = mockIpc;

vi.mock("../../lib/ipc", () => ({
  ...mockIpc,
  IpcError: class extends Error {},
}));

const { HistoryView } = await import("./HistoryView");
const { resetWorkspace, openTestProject, patchNavigation } =
  await import("../../test/workspace");
const { useActiveRepository } = await import("../../state/workspace");
const { useHistory } = await import("../../state/history");

/** A merge history shaped like the reference mockup: dev merged into main. */
function mergePage(): HistoryPage {
  const commit = (id: string, parents: string[], summary: string) => ({
    id: id.padEnd(40, "0"),
    parents: parents.map((p) => p.padEnd(40, "0")),
    summary,
    message: summary,
    author_name: "David Cardenas",
    author_email: "david@example.com",
    author_time: "1788815520",
    commit_time: "1788815520",
  });

  return {
    commits: [
      commit("m", ["a", "b"], "Merge pull request #1 from dcardenasl/dev"),
      commit("a", ["base"], "chore: release v1.0.0"),
      commit("b", ["base"], "feat(site): add referrer policy header"),
      commit("base", [], "initial commit"),
    ],
    next_cursor: null,
    roots: [],
    references: [],
  };
}

/** Loads the history the way the shell does, then hands it to the view. */
function Harness() {
  const repository = useActiveRepository();
  const history = useHistory(repository?.path ?? null);
  return <HistoryView history={history} />;
}

function renderView() {
  return renderWithQueryClient(<Harness />);
}

beforeEach(() => {
  mockIpc.getRepositoryRefs.mockResolvedValue({
    branches: [],
    tags: [],
    head: null,
    head_reference: null,
    roots: [],
  });
  getCommits.mockReset();
  getWorktreeSnapshot.mockReset();
  getWorktreeSnapshot.mockResolvedValue({
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
      files: [],
      total_files: 0,
      next_cursor: null,
      insertions: 0,
      deletions: 0,
    },
  });
  resetWorkspace();
  openTestProject({ path: "/tmp/repo", name: "repo" });
  patchNavigation({ selection: { kind: "history" } });
});

afterEach(cleanup);

describe("HistoryView", () => {
  it("starts history from full reference names and carries the frozen scope", async () => {
    getCommits.mockResolvedValue(mergePage());
    renderView();

    await waitFor(() => {
      expect(getCommits).toHaveBeenCalledWith("/tmp/repo", {
        limit: 500,
        cursor: null,
        roots: null,
        references: ["HEAD"],
      });
    });
  });

  it("draws a node for every commit and the merge as a curve", async () => {
    getCommits.mockResolvedValue(mergePage());

    const { container } = renderView();

    await waitFor(() => {
      expect(container.querySelectorAll("circle")).toHaveLength(4);
    });

    const curves = [...container.querySelectorAll("path")].filter((path) =>
      path.getAttribute("d")?.includes("C"),
    );
    expect(curves.length).toBeGreaterThan(0);
  });

  it("shows the commit summaries alongside the graph", async () => {
    getCommits.mockResolvedValue(mergePage());

    renderView();

    expect(
      await screen.findByText("Merge pull request #1 from dcardenasl/dev"),
    ).toBeInstanceOf(HTMLElement);
    expect(screen.getByText("chore: release v1.0.0")).toBeInstanceOf(
      HTMLElement,
    );
  });

  it("reports a failure instead of rendering an empty graph", async () => {
    getCommits.mockRejectedValue(new Error("no se pudo leer el historial"));

    renderView();

    expect(await screen.findByRole("alert")).toBeInstanceOf(HTMLElement);
  });

  it("says so when the repository has no commits", async () => {
    getCommits.mockResolvedValue({
      commits: [],
      next_cursor: null,
      roots: [],
      references: [],
    });

    renderView();

    expect(
      await screen.findByText("Este repositorio no tiene commits."),
    ).toBeInstanceOf(HTMLElement);
  });

  it("requests the next page when one is available", async () => {
    const page = mergePage();
    getCommits
      .mockResolvedValueOnce({ ...page, next_cursor: "cursor-1" })
      .mockResolvedValueOnce({ ...page, commits: [] });

    renderView();

    await waitFor(() => {
      expect(getCommits).toHaveBeenCalledTimes(2);
    });
    expect(getCommits.mock.calls[1]?.[1]).toMatchObject({ cursor: "cursor-1" });
  });

  it("keeps loaded commits visible and retries a failed next page", async () => {
    const page = mergePage();
    getCommits
      .mockResolvedValueOnce({ ...page, next_cursor: "cursor-1" })
      .mockRejectedValueOnce(new Error("falló la página siguiente"))
      .mockResolvedValueOnce({ ...page, commits: [] });

    renderView();

    expect(
      await screen.findByText("Merge pull request #1 from dcardenasl/dev"),
    ).toBeInstanceOf(HTMLElement);
    expect(await screen.findByRole("alert")).toBeInstanceOf(HTMLElement);
    expect(
      screen.getByText("Merge pull request #1 from dcardenasl/dev"),
    ).toBeInstanceOf(HTMLElement);

    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    await waitFor(() => {
      expect(getCommits).toHaveBeenCalledTimes(3);
    });
    expect(getCommits.mock.calls[2]?.[1]).toMatchObject({ cursor: "cursor-1" });
    await waitFor(() => {
      expect(screen.queryByRole("alert")).toBeNull();
    });
  });
});

it("releases obsolete frozen walks when reference roots change", async () => {
  const { act } = await import("@testing-library/react");
  getCommits.mockResolvedValue(mergePage());
  const { client, container } = renderView();
  await waitFor(() => {
    expect(container.querySelectorAll("circle")).toHaveLength(4);
  });
  const oldHistoryKey = ["history", "/tmp/repo", ["HEAD"], ["HEAD\u0000"]];
  expect(client.getQueryData(oldHistoryKey)).toBeDefined();
  act(() => {
    client.setQueryData(["refs", "/tmp/repo"], {
      branches: [],
      tags: [],
      head: "next",
      head_reference: null,
      roots: ["next"],
    });
  });
  await waitFor(() => {
    expect(client.getQueryData(oldHistoryKey)).toBeUndefined();
  });
  await waitFor(() => {
    expect(container.querySelectorAll("circle")).toHaveLength(4);
  });
});
