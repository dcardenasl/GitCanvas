// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  BranchInfo,
  CommitDiff,
  CommitInfo,
  HistoryPage,
} from "../../bindings";

const getCommits = vi.fn<() => Promise<HistoryPage>>();
const getCommitDiff = vi.fn<() => Promise<CommitDiff>>();
const getBranches = vi.fn<() => Promise<BranchInfo[]>>();

vi.mock("../../lib/ipc", () => ({
  getCommits: () => getCommits(),
  getCommitDiff: () => getCommitDiff(),
  getWorktreeSnapshot: () =>
    Promise.resolve({
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
    }),
  getWorktreeFingerprint: () => Promise.resolve({ revision: "revision" }),
  getWorktreeFileContent: () => Promise.resolve(null),
  getBranches: () => getBranches(),
  getTags: () => Promise.resolve([]),
  getStartupRepository: () => Promise.resolve(null),
  getFileContent: () => Promise.resolve(null),
  checkoutBranch: () => Promise.resolve(null),
  pullFastForward: () => Promise.resolve(null),
  pushCurrentBranch: () => Promise.resolve(null),
  watchRepository: () => Promise.resolve(null),
  unwatchRepository: () => Promise.resolve(null),
  onRepositoryChanged: () => Promise.resolve(() => undefined),
  IpcError: class extends Error {},
}));

const { AppShell } = await import("./AppShell");
const { useSession } = await import("../../state/session");

const COMMIT: CommitInfo = {
  id: "a".repeat(40),
  parents: [],
  summary: "feat: something",
  message: "feat: something",
  author_name: "David Cardenas",
  author_email: "david@example.com",
  author_time: "1788815520",
  commit_time: "1788815520",
};

function renderShell() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AppShell />
    </QueryClientProvider>,
  );
}

/**
 * The grid declares five columns. Rendering any other number of children
 * shifts every later one into the wrong column — which once dropped the file
 * view into the sidebar's zero-width slot and left the inspector filling the
 * window. The count is the invariant, so it is what gets asserted.
 */
const GRID_CHILDREN = 5;

beforeEach(() => {
  vi.clearAllMocks();
  getCommits.mockResolvedValue({
    commits: [COMMIT],
    next_cursor: null,
    roots: [],
  });
  HTMLDialogElement.prototype.showModal = vi.fn();
  getBranches.mockResolvedValue([]);
  getCommitDiff.mockResolvedValue({
    commit_id: COMMIT.id,
    parent_id: null,
    files: [
      {
        path: "a.txt",
        old_path: null,
        change: "Modified",
        insertions: 1,
        deletions: 0,
        omitted: null,
        patch: "@@ -1 +1 @@\n+a\n",
      },
    ],
    insertions: 1,
    deletions: 0,
    is_merge: false,
  });
  useSession.setState({
    repository: { path: "/tmp/repo", name: "repo" },
    selection: { kind: "history" },
    expandedFilePath: null,
    revealCommitId: null,
  });
});
afterEach(cleanup);

describe("AppShell layout", () => {
  it("keeps the grid children matched to its columns with nothing selected", async () => {
    const { container } = renderShell();

    await waitFor(() => {
      expect(container.querySelector(".app-shell__body")).not.toBeNull();
    });
    expect(container.querySelector(".app-shell__body")?.children).toHaveLength(
      GRID_CHILDREN,
    );
  });

  it("keeps them matched with a commit selected", async () => {
    useSession.setState({
      selection: { kind: "commit", commitId: COMMIT.id, filePath: null },
    });
    const { container } = renderShell();

    await waitFor(() => {
      expect(container.querySelector(".detail-panel")).not.toBeNull();
    });
    expect(container.querySelector(".app-shell__body")?.children).toHaveLength(
      GRID_CHILDREN,
    );
  });

  it("keeps them matched while a file is open and the sidebar is collapsed", async () => {
    useSession.setState({
      selection: { kind: "commit", commitId: COMMIT.id, filePath: "a.txt" },
    });
    const { container } = renderShell();

    await waitFor(() => {
      expect(container.querySelector(".file-diff")).not.toBeNull();
    });

    const body = container.querySelector(".app-shell__body");
    expect(body?.children).toHaveLength(GRID_CHILDREN);

    // The sidebar gave up its width but kept its place; the file view must be
    // in the flexible column, not in the collapsed one.
    const sidebar = container.querySelector(".sidebar");
    expect(sidebar?.hasAttribute("hidden")).toBe(true);
    expect(body?.children[0]).toBe(sidebar);
    expect(body?.children[2]?.classList.contains("app-shell__history")).toBe(
      true,
    );
  });

  it("collapses the sidebar to zero width rather than unmounting it", async () => {
    useSession.setState({
      selection: { kind: "commit", commitId: COMMIT.id, filePath: "a.txt" },
    });
    const { container } = renderShell();

    await waitFor(() => {
      expect(container.querySelector(".file-diff")).not.toBeNull();
    });

    const body = container.querySelector<HTMLElement>(".app-shell__body");
    expect(body?.style.getPropertyValue("--sidebar-width")).toBe("0px");
    expect(body?.style.getPropertyValue("--sidebar-divider")).toBe("0px");
  });
});

describe("AppShell push confirmation", () => {
  it("names the checked-out branch, not the repository folder", async () => {
    getBranches.mockResolvedValue([
      {
        name: "feature/login",
        full_name: "refs/heads/feature/login",
        target: COMMIT.id,
        is_remote: false,
        is_head: true,
        is_symbolic: false,
      },
    ]);
    renderShell();

    const push = await screen.findByRole("button", { name: "Push" });
    await waitFor(() => {
      expect(push).toHaveProperty("disabled", false);
    });
    await userEvent.click(push);

    const dialog = await screen.findByText(/Se van a enviar los commits de/);
    expect(dialog.querySelector("strong")?.textContent).toBe("feature/login");
  });

  it("keeps push disabled while no branch is checked out", async () => {
    renderShell();

    const push = await screen.findByRole("button", { name: "Push" });
    expect(push).toHaveProperty("disabled", true);
  });
});
