// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { HistoryPage, WorktreeSnapshot } from "../../bindings";

const getCommits =
  vi.fn<(path: string, request: unknown) => Promise<HistoryPage>>();
const getWorktreeSnapshot =
  vi.fn<(path: string, request: unknown) => Promise<WorktreeSnapshot>>();

vi.mock("../../lib/ipc", () => ({
  getCommits: (path: string, request: unknown) => getCommits(path, request),
  getWorktreeSnapshot: (path: string, request: unknown) =>
    getWorktreeSnapshot(path, request),
  IpcError: class extends Error {},
}));

const { HistoryView } = await import("./HistoryView");
const { useSession } = await import("../../state/session");

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
  };
}

function renderView() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <HistoryView />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
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
  useSession.setState({
    repository: { path: "/tmp/repo", name: "repo" },
    selection: { kind: "history" },
  });
});

afterEach(cleanup);

describe("HistoryView", () => {
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
    ).toBeDefined();
    expect(screen.getByText("chore: release v1.0.0")).toBeDefined();
  });

  it("reports a failure instead of rendering an empty graph", async () => {
    getCommits.mockRejectedValue(new Error("no se pudo leer el historial"));

    renderView();

    expect(await screen.findByRole("alert")).toBeDefined();
  });

  it("says so when the repository has no commits", async () => {
    getCommits.mockResolvedValue({
      commits: [],
      next_cursor: null,
      roots: [],
    });

    renderView();

    expect(
      await screen.findByText("Este repositorio no tiene commits."),
    ).toBeDefined();
  });

  it("requests the next page when one is available", async () => {
    const page = mergePage();
    getCommits
      .mockResolvedValueOnce({ ...page, next_cursor: "cursor-1" })
      .mockResolvedValueOnce(page);

    renderView();

    await waitFor(() => {
      expect(getCommits).toHaveBeenCalledTimes(2);
    });
    expect(getCommits.mock.calls[1]?.[1]).toMatchObject({ cursor: "cursor-1" });
  });
});
