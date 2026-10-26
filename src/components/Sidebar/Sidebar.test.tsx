// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  BranchInfo,
  RepositoryWorktreesSnapshot,
  TagInfo,
} from "../../bindings";
import { createIpcMocks, renderWithQueryClient } from "../../test/test-utils";

const getBranches = vi.fn<() => Promise<BranchInfo[]>>();
const getTags = vi.fn<() => Promise<TagInfo[]>>();
const mockIpc = createIpcMocks([
  "getRepositoryRefs",
  "getRepositoryWorktrees",
  "openRepository",
] as const);

vi.mock("../../lib/ipc", () => mockIpc);

const { Sidebar } = await import("./Sidebar");
const { resetWorkspace, openTestProject, patchNavigation, activeNavigation } =
  await import("../../test/workspace");
const { useWorkspace } = await import("../../state/workspace");

const MAIN_TIP = "1".repeat(40);
const DEV_TIP = "2".repeat(40);

function branch(overrides: Partial<BranchInfo> = {}): BranchInfo {
  return {
    name: "main",
    full_name: "refs/heads/main",
    target: MAIN_TIP,
    is_remote: false,
    is_head: false,
    is_symbolic: false,
    upstream: null,
    symbolic_target: null,
    ...overrides,
  };
}

function renderSidebar(onCheckout?: (branch: string) => void) {
  renderWithQueryClient(
    <Sidebar {...(onCheckout === undefined ? {} : { onCheckout })} />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockIpc.getRepositoryRefs.mockImplementation(async () => {
    const branches = await getBranches();
    const tags = await getTags();
    return {
      branches,
      tags,
      head: null,
      head_reference: null,
      roots: [
        ...new Set(
          branches.flatMap((branch) =>
            branch.target === null ? [] : [branch.target],
          ),
        ),
      ],
    };
  });
  getBranches.mockResolvedValue([
    branch(),
    branch({
      name: "dev",
      full_name: "refs/heads/dev",
      target: DEV_TIP,
      is_head: true,
    }),
    branch({
      name: "origin/main",
      full_name: "refs/remotes/origin/main",
      target: MAIN_TIP,
      is_remote: true,
    }),
  ]);
  getTags.mockResolvedValue([]);
  resetWorkspace();
  mockIpc.getRepositoryWorktrees.mockResolvedValue({
    repository_id: "/common/repo.git",
    current_root: "/tmp/repo",
    worktrees: [
      {
        name: "repo",
        root: "/tmp/repo",
        is_main: true,
        is_active: true,
        availability: "available",
        head: { kind: "unknown" },
        locked: false,
        lock_reason: null,
      },
    ],
  });
  mockIpc.openRepository.mockImplementation((path) =>
    Promise.resolve({
      path,
      name: path.split("/").pop() ?? path,
    }),
  );
  openTestProject({ path: "/tmp/repo", name: "repo" });
  patchNavigation({ selection: { kind: "history" }, revealCommitId: null });
});
afterEach(cleanup);

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe("Sidebar", () => {
  it("announces and disables the worktree inventory while it refreshes", async () => {
    renderSidebar();

    const section = await screen.findByRole("region", {
      name: "Worktrees vinculados",
    });
    const pending = deferred<RepositoryWorktreesSnapshot>();
    mockIpc.getRepositoryWorktrees.mockReturnValueOnce(pending.promise);

    await userEvent.click(
      screen.getByRole("button", { name: "Actualizar worktrees" }),
    );

    expect(section.getAttribute("aria-busy")).toBe("true");
    expect(
      screen
        .getByRole("button", { name: "Actualizar worktrees" })
        .hasAttribute("disabled"),
    ).toBe(true);

    pending.resolve({
      repository_id: "/common/repo.git",
      current_root: "/tmp/repo",
      worktrees: [
        {
          name: "repo",
          root: "/tmp/repo",
          is_main: true,
          is_active: true,
          availability: "available",
          head: { kind: "branch", reference: "refs/heads/main" },
          locked: false,
          lock_reason: null,
        },
      ],
    });

    await waitFor(() => {
      expect(section.getAttribute("aria-busy")).toBe("false");
      expect(
        screen
          .getByRole("button", { name: "Actualizar worktrees" })
          .hasAttribute("disabled"),
      ).toBe(false);
    });
  });

  it("opens an inventoried linked worktree through normal repository validation", async () => {
    mockIpc.getRepositoryWorktrees.mockResolvedValue({
      repository_id: "/common/repo.git",
      current_root: "/tmp/repo",
      worktrees: [
        {
          name: "repo",
          root: "/tmp/repo",
          is_main: true,
          is_active: true,
          availability: "available",
          head: { kind: "branch", reference: "refs/heads/main" },
          locked: false,
          lock_reason: null,
        },
        {
          name: "repo-feature",
          root: "/tmp/repo-feature",
          is_main: false,
          is_active: false,
          availability: "available",
          head: { kind: "branch", reference: "refs/heads/feature" },
          locked: false,
          lock_reason: null,
        },
      ],
    });
    renderSidebar();

    const linked = await screen.findByTitle("/tmp/repo-feature");
    await userEvent.click(linked);
    await userEvent.click(await screen.findByTitle("/tmp/repo-feature"));

    expect(mockIpc.openRepository).toHaveBeenCalledTimes(2);
    expect(
      useWorkspace
        .getState()
        .tabs.filter((tab) => tab.repository.path === "/tmp/repo-feature"),
    ).toHaveLength(1);
  });

  it("filters a whole reference folder as one undo step", async () => {
    getBranches.mockResolvedValue([
      branch({ name: "feature/one", full_name: "refs/heads/feature/one" }),
      branch({ name: "feature/two", full_name: "refs/heads/feature/two" }),
      branch({ name: "main", full_name: "refs/heads/main" }),
    ]);
    renderSidebar();

    const folder = await screen.findByRole("checkbox", {
      name: "Alternar referencias de feature",
    });
    await userEvent.click(folder);

    expect(useWorkspace.getState().referenceFilters[0]?.excluded).toEqual([
      "refs/heads/feature/one",
      "refs/heads/feature/two",
    ]);
    expect(
      useWorkspace.getState().referenceFilterUndo["/tmp/repo"],
    ).toHaveLength(1);
  });

  it("limits bulk actions to references matching the panel search", async () => {
    renderSidebar();
    await userEvent.click(
      await screen.findByRole("checkbox", {
        name: "Incluir main en el historial",
      }),
    );
    await userEvent.type(
      screen.getByRole("searchbox", { name: "Filtrar referencias" }),
      "origin",
    );
    await userEvent.click(screen.getByRole("button", { name: "Mostrar todo" }));

    expect(useWorkspace.getState().referenceFilters[0]?.excluded).toEqual([
      "refs/heads/main",
    ]);
  });

  it("takes you to the tip of the branch you choose", async () => {
    renderSidebar();

    await userEvent.click(await screen.findByRole("button", { name: /^main/ }));

    const state = activeNavigation();
    expect(state.selection).toEqual({
      kind: "commit",
      commitId: MAIN_TIP,
      filePath: null,
    });
    expect(state.revealCommitId).toBe(MAIN_TIP);
  });

  it("offers filter actions for tags as well as branches", async () => {
    getTags.mockResolvedValue([
      {
        name: "v1",
        target: MAIN_TIP,
        commit_id: MAIN_TIP,
        is_annotated: false,
        commit_time: "1",
      },
    ]);
    renderSidebar();

    await userEvent.click(
      await screen.findByRole("button", { name: "Acciones de v1" }),
    );
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Mostrar solo esta referencia" }),
    );

    expect(useWorkspace.getState().referenceFilters[0]?.excluded).toEqual([
      "HEAD",
      "refs/heads/dev",
      "refs/heads/main",
      "refs/remotes/origin/main",
    ]);
  });

  it("separates local branches from remote ones", async () => {
    renderSidebar();

    expect(await screen.findByText("Local")).toBeInstanceOf(HTMLElement);
    expect(screen.getByText("Remotas")).toBeInstanceOf(HTMLElement);
    expect(
      screen.getByRole("button", { name: /^origin\/main/ }),
    ).toBeInstanceOf(HTMLElement);
  });

  it("marks the checked-out branch", async () => {
    renderSidebar();

    const dev = await screen.findByRole("button", { name: /^dev/ });
    expect(dev.textContent).toContain("HEAD");
  });

  it("marks the ref whose commit is selected", async () => {
    patchNavigation({
      selection: { kind: "commit", commitId: DEV_TIP, filePath: null },
    });
    renderSidebar();

    const dev = await screen.findByRole("button", { name: /^dev/ });
    expect(dev.getAttribute("aria-current")).toBe("true");
  });

  it("disables a tag that does not point at a commit", async () => {
    // An annotated tag on a non-commit object: it has a target, but nothing in
    // the history to navigate to.
    getTags.mockResolvedValue([
      {
        name: "v0.1.0",
        target: "9".repeat(40),
        commit_id: null,
        is_annotated: true,
        commit_time: "0",
      },
    ]);
    renderSidebar();

    const tag = (await screen.findAllByRole("button", { name: /v0\.1\.0/ }))[0];
    if (!tag) throw new Error("Expected the tag row button to render");
    expect(tag.hasAttribute("disabled")).toBe(true);
  });

  it("navigates a tag to its resolved commit, not to the tag object", async () => {
    // An annotated tag points at a tag object; only `commit_id` is in the
    // history, so that is the only id worth navigating to.
    getTags.mockResolvedValue([
      {
        name: "v0.1.0",
        target: "9".repeat(40),
        commit_id: MAIN_TIP,
        is_annotated: true,
        commit_time: "0",
      },
    ]);
    renderSidebar();

    const tagButtons = await screen.findAllByRole("button", {
      name: /v0\.1\.0/,
    });
    const tag = tagButtons[0];
    if (!tag) throw new Error("Expected the tag row button to render");
    await userEvent.click(tag);

    expect(activeNavigation().revealCommitId).toBe(MAIN_TIP);
  });

  it("omits a group that has nothing in it", async () => {
    getBranches.mockResolvedValue([branch()]);
    renderSidebar();

    await screen.findByText("Local");
    expect(screen.queryByText("Remotas")).toBeNull();
    expect(screen.queryByText("Etiquetas")).toBeNull();
  });

  describe("checkout", () => {
    it("offers to switch to a local branch that is not checked out", async () => {
      const onCheckout = vi.fn();
      renderSidebar(onCheckout);

      fireEvent.contextMenu(
        await screen.findByRole("button", { name: /^main/ }),
      );
      await userEvent.click(
        await screen.findByRole("menuitem", { name: "Cambiar a main" }),
      );

      expect(onCheckout).toHaveBeenCalledWith("main");
    });

    it("can open the checkout menu and switch branches from the keyboard", async () => {
      const onCheckout = vi.fn();
      renderSidebar(onCheckout);

      const branchButton = await screen.findByRole("button", { name: /^main/ });
      branchButton.focus();
      await userEvent.keyboard("{Shift>}{F10}{/Shift}");
      await userEvent.keyboard("{End}{Enter}");

      expect(onCheckout).toHaveBeenCalledWith("main");
    });

    it("offers visual actions without checkout on the checked-out branch", async () => {
      renderSidebar(vi.fn());

      fireEvent.contextMenu(
        await screen.findByRole("button", { name: /^dev/ }),
      );

      expect(
        screen.queryByRole("menuitem", { name: /^Cambiar a / }),
      ).toBeNull();
    });

    it("offers visual actions without checkout on remote branches", async () => {
      renderSidebar(vi.fn());

      fireEvent.contextMenu(
        await screen.findByRole("button", { name: /^origin\/main/ }),
      );

      expect(
        screen.queryByRole("menuitem", { name: /^Cambiar a / }),
      ).toBeNull();
    });

    it("offers no checkout when the caller cannot perform one", async () => {
      renderSidebar();

      fireEvent.contextMenu(
        await screen.findByRole("button", { name: /^main/ }),
      );

      expect(
        screen.queryByRole("menuitem", { name: /^Cambiar a / }),
      ).toBeNull();
    });
  });
});

it("chooses colors and a visual principal without checkout or another Git read", async () => {
  const { useWorkspace } = await import("../../state/workspace");
  const onCheckout = vi.fn();
  renderSidebar(onCheckout);
  const actions = await screen.findByRole("button", {
    name: "Acciones de main",
  });
  const before = mockIpc.getRepositoryRefs.mock.calls.length;
  await userEvent.click(actions);
  await userEvent.click(
    await screen.findByRole("menuitem", { name: "Cambiar color de rama…" }),
  );
  await userEvent.click(screen.getByRole("button", { name: "Azul" }));
  expect(
    useWorkspace
      .getState()
      .graphPreferences[0]?.colors.find(
        (color) => color.reference === "refs/heads/main",
      )?.color,
  ).toBe("blue");
  await userEvent.click(actions);
  await userEvent.click(
    await screen.findByRole("menuitem", { name: "Usar como principal visual" }),
  );
  expect(useWorkspace.getState().graphPreferences[0]?.principal).toBe(
    "refs/heads/main",
  );
  expect(onCheckout).not.toHaveBeenCalled();
  expect(mockIpc.getRepositoryRefs).toHaveBeenCalledTimes(before);
  expect(activeNavigation().selection).toEqual({ kind: "history" });
});

it("restores the action button's focus when the palette closes with Escape", async () => {
  renderSidebar();
  const actions = await screen.findByRole("button", {
    name: "Acciones de main",
  });
  await userEvent.click(actions);
  await userEvent.click(
    await screen.findByRole("menuitem", { name: "Cambiar color de rama…" }),
  );
  expect(screen.getByRole("group", { name: "Color de main" })).toBeInstanceOf(
    HTMLElement,
  );
  await userEvent.keyboard("{Escape}");
  expect(screen.queryByRole("group", { name: "Color de main" })).toBeNull();
  expect(document.activeElement).toBe(actions);
});

it("shows a read failure with retry rather than treating it as an empty repository", async () => {
  mockIpc.getRepositoryRefs.mockRejectedValueOnce(
    new Error("reference read failed"),
  );
  renderSidebar();
  expect(await screen.findByRole("alert")).toBeInstanceOf(HTMLElement);
  expect(screen.queryByText("Sin ramas ni etiquetas")).toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  expect(await screen.findByRole("button", { name: /^main/ })).toBeInstanceOf(
    HTMLElement,
  );
});
