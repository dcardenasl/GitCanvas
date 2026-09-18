// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
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
const { useFileListPreferences } =
  await import("../../state/fileListPreferences");

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
  localStorage.removeItem("gitcanvas.file-list-view");
  useFileListPreferences.setState({ view: "path" });
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
    const list = await screen.findByRole("list", {
      name: "Archivos preparados",
    });
    await userEvent.click(within(list).getByRole("button"));

    expect(useSession.getState().selection).toEqual({
      kind: "worktree",
      side: "staged",
      filePath: "src/app.ts",
    });
  });

  it("groups files by directory and preserves the staged/unstaged source", async () => {
    getWorktreeSnapshot.mockResolvedValue(
      local(
        [file({ path: "src/app.ts" })],
        [file({ path: "src/components/Button.tsx" })],
      ),
    );

    renderPanel();
    await screen.findByRole("list", { name: "Archivos preparados" });
    await userEvent.click(screen.getByRole("button", { name: "Árbol" }));

    const unstaged = await screen.findByRole("region", {
      name: "Sin preparar",
    });
    const tree = within(unstaged).getByRole("list", {
      name: "Archivos sin preparar",
    });
    expect(
      within(tree).getByRole("button", { name: "src, 1 archivo modificado" }),
    ).toBeDefined();
    expect(within(tree).getByText("Button.tsx")).toBeDefined();

    await userEvent.click(within(tree).getByText("Button.tsx"));
    expect(useSession.getState().selection).toEqual({
      kind: "worktree",
      side: "unstaged",
      filePath: "src/components/Button.tsx",
    });
  });

  it("collapses and expands every directory from the shared control", async () => {
    getWorktreeSnapshot.mockResolvedValue(
      local([file({ path: "src/a.ts" })], [file({ path: "test/b.ts" })]),
    );

    renderPanel();
    await screen.findByRole("list", { name: "Archivos preparados" });
    await userEvent.click(screen.getByRole("button", { name: "Árbol" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Contraer todo" }),
    );

    expect(
      screen
        .getByRole("button", { name: "src, 1 archivo modificado" })
        .getAttribute("aria-expanded"),
    ).toBe("false");
    expect(screen.getByText("Expandir todo")).toBeDefined();

    await userEvent.click(
      screen.getByRole("button", { name: "Expandir todo" }),
    );
    expect(
      screen
        .getByRole("button", { name: "test, 1 archivo modificado" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
  });
});
