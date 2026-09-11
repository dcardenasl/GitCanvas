// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FileDiff, WorktreeSnapshot } from "../../bindings";

const getWorktreeSnapshot =
  vi.fn<(path: string, request: unknown) => Promise<WorktreeSnapshot>>();

vi.mock("../../lib/ipc", () => ({
  getWorktreeSnapshot: (path: string, request: unknown) =>
    getWorktreeSnapshot(path, request),
}));

const { WorkingTreeDetailPanel } = await import("./WorkingTreeDetailPanel");
const { useSession } = await import("../../state/session");

function file(overrides: Partial<FileDiff> = {}): FileDiff {
  return {
    path: "src/app.ts",
    old_path: null,
    change: "Modified",
    insertions: 2,
    deletions: 1,
    omitted: null,
    patch: "@@ -1 +1 @@\n-a\n+b\n",
    ...overrides,
  };
}

function local(
  stagedFiles: FileDiff[],
  unstagedFiles: FileDiff[],
): WorktreeSnapshot {
  const page = (files: FileDiff[], side: "staged" | "unstaged") => {
    const summaries = files.map((entry) => ({
      path: entry.path,
      old_path: entry.old_path,
      change: entry.change,
      insertions: entry.insertions,
      deletions: entry.deletions,
      omitted: entry.omitted,
    }));
    return {
      side,
      revision: "revision",
      files: summaries,
      total_files: summaries.length,
      next_cursor: null,
      insertions: summaries.reduce((sum, entry) => sum + entry.insertions, 0),
      deletions: summaries.reduce((sum, entry) => sum + entry.deletions, 0),
    };
  };
  return {
    revision: "revision",
    staged: page(stagedFiles, "staged"),
    unstaged: page(unstagedFiles, "unstaged"),
  };
}

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <WorkingTreeDetailPanel repositoryPath="/tmp/repo" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  getWorktreeSnapshot.mockReset();
  useSession.setState({
    selection: { kind: "history" },
  });
});
afterEach(cleanup);

describe("WorkingTreeDetailPanel", () => {
  it("separates staged and unstaged files", async () => {
    getWorktreeSnapshot.mockResolvedValue(
      local([file({ path: "staged.ts" })], [file({ path: "local.ts" })]),
    );

    renderPanel();

    expect(
      await screen.findByRole("region", { name: "Preparados" }),
    ).toBeDefined();
    expect(screen.getByRole("region", { name: "Sin preparar" })).toBeDefined();
    expect(screen.getByText("staged.ts")).toBeDefined();
    expect(screen.getByText("local.ts")).toBeDefined();
  });

  it("opens a local file with the correct source", async () => {
    getWorktreeSnapshot.mockResolvedValue(local([file()], []));

    renderPanel();
    await userEvent.click(await screen.findByRole("button"));

    expect(useSession.getState().selection).toEqual({
      kind: "worktree",
      side: "staged",
      filePath: "src/app.ts",
    });
  });
});
