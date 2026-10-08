// @vitest-environment jsdom
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  BranchInfo,
  CommitDiff,
  CommitInfo,
  HistoryPage,
} from "../../bindings";
import { renderWithQueryClient } from "../../test/test-utils";

const getCommits = vi.fn<() => Promise<HistoryPage>>();
const getCommitDiff = vi.fn<() => Promise<CommitDiff>>();
const getBranches = vi.fn<() => Promise<BranchInfo[]>>();
const getStartupRepository =
  vi.fn<() => Promise<{ path: string; name: string } | null>>();
const watchRepository = vi.fn<(request: unknown) => Promise<null>>();

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
  getStartupRepository: () => getStartupRepository(),
  hasGithubToken: () => Promise.resolve(false),
  storeGithubToken: () => Promise.resolve(null),
  forgetGithubToken: () => Promise.resolve(null),
  cloneGithubRepository: () => Promise.resolve(null),
  openRepository: () => Promise.resolve(null),
  listGithubRepositories: () =>
    Promise.resolve({ repositories: [], truncated: false }),
  onCloneProgress: () => Promise.resolve(() => undefined),
  getFileContent: () => Promise.resolve(null),
  checkoutBranch: () => Promise.resolve(null),
  pullFastForward: () => Promise.resolve(null),
  pushCurrentBranch: () => Promise.resolve(null),
  watchRepository: (request: unknown) => watchRepository(request),
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
  return renderWithQueryClient(<AppShell />);
}

function gridForHistory(): HTMLElement {
  const history = screen.getByRole("main", { name: "Historial" });
  const grid = history.parentElement;
  if (grid === null)
    throw new Error("History must be inside the application grid");
  return grid;
}

function expectGridOrder(
  inspectorName: "Cambios locales" | "Detalle del commit",
) {
  const grid = gridForHistory();
  const slots = Array.from(grid.children);
  expect(slots).toHaveLength(5);
  expect(slots[0]).toBe(
    screen.getByLabelText("Ramas y etiquetas", { selector: "aside" }),
  );
  expect(slots[1]).toBe(
    screen.getByLabelText("Ancho de la barra lateral", {
      selector: '[role="separator"]',
    }),
  );
  expect(slots[2]).toBe(screen.getByRole("main", { name: "Historial" }));
  expect(slots[3]).toBe(
    screen.getByRole("separator", { name: "Ancho del panel de detalle" }),
  );
  expect(slots[4]).toBe(
    screen.getByRole("complementary", { name: inspectorName }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getCommits.mockResolvedValue({
    commits: [COMMIT],
    next_cursor: null,
    roots: [],
  });
  HTMLDialogElement.prototype.showModal = vi.fn();
  getBranches.mockResolvedValue([]);
  getStartupRepository.mockResolvedValue(null);
  watchRepository.mockResolvedValue(null);
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
    renderShell();
    await screen.findByRole("complementary", { name: "Cambios locales" });
    expectGridOrder("Cambios locales");
  });

  it("keeps them matched with a commit selected", async () => {
    useSession.setState({
      selection: { kind: "commit", commitId: COMMIT.id, filePath: null },
    });
    renderShell();
    await screen.findByRole("complementary", { name: "Detalle del commit" });
    expectGridOrder("Detalle del commit");
  });

  it("keeps them matched while a file is open and the sidebar is collapsed", async () => {
    useSession.setState({
      selection: { kind: "commit", commitId: COMMIT.id, filePath: "a.txt" },
    });
    renderShell();
    await screen.findByRole("region", { name: "Cambios en a.txt" });
    expectGridOrder("Detalle del commit");

    // The sidebar gave up its width but kept its place; the file view must be
    // in the flexible column, not in the collapsed one.
    const sidebar = screen.getByLabelText("Ramas y etiquetas", {
      selector: "aside",
    });
    expect(sidebar.hasAttribute("hidden")).toBe(true);
  });

  it("collapses the sidebar to zero width rather than unmounting it", async () => {
    useSession.setState({
      selection: { kind: "commit", commitId: COMMIT.id, filePath: "a.txt" },
    });
    renderShell();
    await screen.findByRole("region", { name: "Cambios en a.txt" });

    const body = gridForHistory();
    expect(body.style.getPropertyValue("--sidebar-width")).toBe("0px");
    expect(body.style.getPropertyValue("--sidebar-divider")).toBe("0px");
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

    const push = await screen.findByRole("button", {
      name: "Enviar cambios",
    });
    await waitFor(() => {
      expect(push).toHaveProperty("disabled", false);
    });
    await userEvent.click(push);

    const confirmation = await screen.findByRole("dialog", { hidden: true });
    expect(within(confirmation).getByText("feature/login")).toBeInstanceOf(
      HTMLElement,
    );
  });

  it("keeps push disabled while no branch is checked out", async () => {
    renderShell();

    const push = await screen.findByRole("button", {
      name: "Enviar cambios",
    });
    expect(push).toHaveProperty("disabled", true);
  });
});

describe("AppShell toolbar", () => {
  it("shows the empty state until a repository is open", async () => {
    useSession.setState({ repository: null });
    renderShell();

    expect(
      await screen.findByText(/Abre un repositorio para ver su historial/),
    ).toBeInstanceOf(HTMLElement);
    expect(screen.getByText("Ningún repositorio abierto")).toBeInstanceOf(
      HTMLElement,
    );
  });

  it("opens the repository named on the command line", async () => {
    useSession.setState({ repository: null });
    getStartupRepository.mockResolvedValue({ path: "/tmp/cli", name: "cli" });
    renderShell();

    await waitFor(() => {
      expect(useSession.getState().repository).toEqual({
        path: "/tmp/cli",
        name: "cli",
      });
    });
  });

  it("does not let a late command-line lookup replace a user selection", async () => {
    let finishStartup: (
      repository: { path: string; name: string } | null,
    ) => void = () => undefined;
    useSession.setState({ repository: null });
    getStartupRepository.mockReturnValue(
      new Promise((resolve) => {
        finishStartup = resolve;
      }),
    );
    renderShell();

    useSession
      .getState()
      .openRepository({ path: "/tmp/manual", name: "manual" });
    await act(async () => {
      finishStartup({ path: "/tmp/cli", name: "cli" });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(useSession.getState().repository).toEqual({
        path: "/tmp/manual",
        name: "manual",
      });
    });
  });

  it("clears an orphaned reveal selection after history is exhausted", async () => {
    useSession.getState().revealCommit("missing-commit");
    renderShell();

    await waitFor(() => {
      expect(useSession.getState().revealCommitId).toBeNull();
    });
    expect(useSession.getState().selection).toEqual({ kind: "history" });
  });

  it("still opens when the command-line lookup fails", async () => {
    useSession.setState({ repository: null });
    getStartupRepository.mockRejectedValue(new Error("no argv"));
    renderShell();

    expect(
      await screen.findByText("Ningún repositorio abierto"),
    ).toBeInstanceOf(HTMLElement);
  });

  it("titles the window with the repository it shows", async () => {
    renderShell();

    await waitFor(() => {
      expect(document.title).toBe("repo — GitCanvas");
    });
  });

  it("re-reads the repository from disk on demand", async () => {
    renderShell();
    await waitFor(() => {
      expect(getBranches).toHaveBeenCalled();
    });
    const before = getBranches.mock.calls.length;

    await userEvent.click(screen.getByRole("button", { name: "Actualizar" }));

    await waitFor(() => {
      expect(getBranches.mock.calls.length).toBeGreaterThan(before);
    });
  });

  it("swaps the history for the GitHub picker and back", async () => {
    renderShell();
    const toggle = await screen.findByRole("button", { name: "GitHub" });

    await userEvent.click(toggle);
    expect(await screen.findByText("Conectar con GitHub")).toBeInstanceOf(
      HTMLElement,
    );
    expect(toggle.getAttribute("aria-pressed")).toBe("true");

    await userEvent.click(toggle);
    await waitFor(() => {
      expect(screen.queryByText("Conectar con GitHub")).toBeNull();
    });
  });

  it("says when the watcher is degraded and retries on request", async () => {
    watchRepository.mockRejectedValue(new Error("too many watches"));
    renderShell();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Watcher degradado");
    expect(alert.textContent).toContain("too many watches");
    const attempts = watchRepository.mock.calls.length;

    watchRepository.mockResolvedValue(null);
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    await waitFor(() => {
      expect(watchRepository.mock.calls.length).toBeGreaterThan(attempts);
    });
    await waitFor(() => {
      expect(screen.queryByText(/Watcher degradado/)).toBeNull();
    });
  });

  it("offers to pin the branch list while a file is open", async () => {
    useSession.setState({
      selection: { kind: "commit", commitId: COMMIT.id, filePath: "a.txt" },
    });
    renderShell();

    const pin = await screen.findByRole("button", { name: "Ramas" });
    expect(pin.getAttribute("aria-pressed")).toBe("false");
    const sidebar = screen.getByLabelText("Ramas y etiquetas", {
      selector: "aside",
    });
    expect(sidebar.hasAttribute("hidden")).toBe(true);

    await userEvent.click(pin);

    expect(pin.getAttribute("aria-pressed")).toBe("true");
    expect(sidebar.hasAttribute("hidden")).toBe(false);
  });
});
