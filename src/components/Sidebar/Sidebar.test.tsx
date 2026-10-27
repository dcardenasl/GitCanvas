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
const { buildRefTree } = await import("./refTree");
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

it("nests folders hierarchically, displays only the last segment of the name, and folds with ▾ / ▸ chevrons", async () => {
  getBranches.mockResolvedValue([
    branch({ name: "main", full_name: "refs/heads/main" }),
    branch({
      name: "feature/ui/modal",
      full_name: "refs/heads/feature/ui/modal",
      target: DEV_TIP,
    }),
    branch({
      name: "feature/ui/tooltip",
      full_name: "refs/heads/feature/ui/tooltip",
      target: DEV_TIP,
    }),
    branch({
      name: "feature/api",
      full_name: "refs/heads/feature/api",
      target: DEV_TIP,
    }),
  ]);
  renderSidebar();

  // Verify folders and subfolders exist
  const featureToggle = await screen.findByRole("button", {
    name: /^feature$/,
  });
  expect(featureToggle.getAttribute("aria-expanded")).toBe("true");
  expect(featureToggle.textContent).toContain("▾");

  const uiToggle = await screen.findByRole("button", {
    name: /^ui$/,
  });
  expect(uiToggle.getAttribute("aria-expanded")).toBe("true");
  expect(uiToggle.textContent).toContain("▾");

  // Leaf rows should display only the last segment as their visible text
  expect(screen.getByText("modal")).toBeInstanceOf(HTMLElement);
  expect(screen.getByText("tooltip")).toBeInstanceOf(HTMLElement);
  expect(screen.getByText("api")).toBeInstanceOf(HTMLElement);

  // But full name is retained in title or aria-label
  expect(screen.getByTitle("feature/ui/modal")).toBeInstanceOf(HTMLElement);

  // Collapsing subfolder 'ui'
  await userEvent.click(uiToggle);
  expect(uiToggle.getAttribute("aria-expanded")).toBe("false");
  expect(uiToggle.textContent).toContain("▸");

  // 'modal' and 'tooltip' should now be hidden
  expect(screen.queryByText("modal")).toBeNull();
  expect(screen.queryByText("tooltip")).toBeNull();

  // Sibling 'api' under 'feature' should still be visible
  expect(screen.getByText("api")).toBeInstanceOf(HTMLElement);

  // Re-expanding 'ui' restores the leaves
  await userEvent.click(uiToggle);
  expect(uiToggle.getAttribute("aria-expanded")).toBe("true");
  expect(screen.getByText("modal")).toBeInstanceOf(HTMLElement);
  expect(screen.getByText("tooltip")).toBeInstanceOf(HTMLElement);
});

it("buildRefTree correctly creates nested folders, leaves, and sorts HEAD first", () => {
  const tree = buildRefTree([
    {
      name: "main",
      referenceId: "refs/heads/main",
      commitId: MAIN_TIP,
      isHead: false,
    },
    {
      name: "dev",
      referenceId: "refs/heads/dev",
      commitId: DEV_TIP,
      isHead: true,
    },
    {
      name: "feature/auth/token",
      referenceId: "refs/heads/feature/auth/token",
      commitId: DEV_TIP,
    },
    {
      name: "feature/auth/oauth",
      referenceId: "refs/heads/feature/auth/oauth",
      commitId: DEV_TIP,
    },
    {
      name: "feature/profile",
      referenceId: "refs/heads/feature/profile",
      commitId: DEV_TIP,
    },
  ]);

  // Root leaves: dev (HEAD) should be first, then main
  expect(tree.leaves.map((l) => l.name)).toEqual(["dev", "main"]);

  // Root folder: feature
  expect(tree.folders).toHaveLength(1);
  const feature = tree.folders[0];
  if (feature === undefined) throw new Error("Expected feature folder");
  expect(feature.name).toBe("feature");
  expect(feature.fullPath).toBe("feature");
  expect(feature.leaves.map((l) => l.name)).toEqual(["profile"]);
  expect(feature.allLeaves).toHaveLength(3);

  // Subfolder: auth
  expect(feature.folders).toHaveLength(1);
  const auth = feature.folders[0];
  if (auth === undefined) throw new Error("Expected auth folder");
  expect(auth.name).toBe("auth");
  expect(auth.fullPath).toBe("feature/auth");
  expect(auth.leaves.map((l) => l.name)).toEqual(["oauth", "token"]);
  expect(auth.allLeaves).toHaveLength(2);
});

it("toggles branch visibility with the eye button, keeps the hidden branch recoverable, and displays partial folder states", async () => {
  getBranches.mockResolvedValue([
    branch({ name: "main", full_name: "refs/heads/main" }),
    branch({
      name: "feature/alpha",
      full_name: "refs/heads/feature/alpha",
      target: DEV_TIP,
    }),
    branch({
      name: "feature/beta",
      full_name: "refs/heads/feature/beta",
      target: DEV_TIP,
    }),
  ]);
  renderSidebar();

  // Find the eye toggle for main
  const mainEye = await screen.findByRole("checkbox", {
    name: "Incluir main en el historial",
  });
  expect(mainEye.getAttribute("aria-checked")).toBe("true");
  expect(mainEye.getAttribute("title")).toContain(
    "Visible en el historial. Clic para ocultar",
  );

  // Click the eye to exclude 'main'
  await userEvent.click(mainEye);
  expect(mainEye.getAttribute("aria-checked")).toBe("false");
  expect(mainEye.getAttribute("title")).toBe(
    "Oculta del historial. Clic para mostrar.",
  );

  // 'main' should remain rendered and accessible to be recovered
  const mainButton = screen.getByRole("button", { name: /^main$/ });
  expect(mainButton).toBeInstanceOf(HTMLElement);
  const mainRow = mainButton.closest("li");
  expect(mainRow?.classList.contains("sidebar__row--hidden")).toBe(true);

  // Check the folder eye for 'feature': both alpha and beta are included -> state 'visible'
  const featureEye = screen.getByRole("checkbox", {
    name: "Alternar referencias de feature",
  });
  expect(featureEye.getAttribute("aria-checked")).toBe("true");

  // Exclude feature/alpha: now 'feature' folder is partially visible (1 of 2)
  const alphaEye = screen.getByRole("checkbox", {
    name: "Incluir feature/alpha en el historial",
  });
  await userEvent.click(alphaEye);

  // Folder should now reflect partial state
  expect(featureEye.getAttribute("aria-checked")).toBe("mixed");
  expect(featureEye.getAttribute("title")).toContain(
    "1 de 2 referencias incluidas. Clic para mostrar todo el grupo.",
  );

  // Clicking the partial folder eye shows all branches in the group
  await userEvent.click(featureEye);
  expect(featureEye.getAttribute("aria-checked")).toBe("true");
  expect(alphaEye.getAttribute("aria-checked")).toBe("true");

  // Clicking it when fully visible hides all branches in the group
  await userEvent.click(featureEye);
  expect(featureEye.getAttribute("aria-checked")).toBe("false");
  expect(alphaEye.getAttribute("aria-checked")).toBe("false");
});

it("displays help popover with rules, search clear button, empty state, and options menu", async () => {
  getBranches.mockResolvedValue([
    branch({ name: "main", full_name: "refs/heads/main", is_head: true }),
    branch({
      name: "origin/HEAD",
      full_name: "refs/remotes/origin/HEAD",
      is_remote: true,
      is_symbolic: true,
      symbolic_target: "refs/remotes/origin/main",
    }),
    branch({
      name: "origin/main",
      full_name: "refs/remotes/origin/main",
      is_remote: true,
    }),
  ]);
  getTags.mockResolvedValue([
    {
      name: "v1.0.0",
      target: MAIN_TIP,
      commit_id: MAIN_TIP,
      commit_time: "2026-10-26T12:00:00Z",
      is_annotated: true,
    },
  ]);

  renderSidebar();

  // Wait for branches to load
  await screen.findByRole("button", { name: /^main$/ });

  // 1. Help button toggles help card
  const helpBtn = screen.getByRole("button", {
    name: "Explorador de referencias",
  });
  expect(screen.queryByText(/Flecha \(▾ \/ ▸\)/)).toBeNull();

  await userEvent.click(helpBtn);
  expect(screen.getByText(/Flecha \(▾ \/ ▸\)/)).toBeInstanceOf(HTMLElement);
  expect(screen.getByText(/Ojo \(👁️\)/)).toBeInstanceOf(HTMLElement);
  expect(
    screen.getByText(/Nota sobre el historial: ocultar una referencia/),
  ).toBeInstanceOf(HTMLElement);

  // Close help card
  const closeHelpBtn = screen.getByRole("button", { name: "Cerrar ayuda" });
  await userEvent.click(closeHelpBtn);
  expect(screen.queryByText(/Flecha \(▾ \/ ▸\)/)).toBeNull();

  // 2. Search and clear button
  const searchInput = screen.getByRole("searchbox");
  await userEvent.type(searchInput, "xyznomatch");

  // Empty state should be visible
  expect(screen.getByText("No hay referencias que coincidan")).toBeInstanceOf(
    HTMLElement,
  );

  // Clear search with empty state clear button
  const allClearBtns = screen.getAllByRole("button", {
    name: "Limpiar búsqueda",
  });
  expect(allClearBtns).toHaveLength(2);
  // Click the empty state clear button
  const emptyClearBtn = allClearBtns[1];
  expect(emptyClearBtn).toBeDefined();
  if (emptyClearBtn !== undefined) {
    await userEvent.click(emptyClearBtn);
  }
  expect(searchInput).toHaveProperty("value", "");
  expect(screen.queryByText("No hay referencias que coincidan")).toBeNull();

  // Type search again and test header clear button (×)
  await userEvent.type(searchInput, "main");
  const headerClearBtn = screen.getByRole("button", {
    name: "Limpiar búsqueda",
  });
  await userEvent.click(headerClearBtn);
  expect(searchInput).toHaveProperty("value", "");

  // 3. Badges: default badge on origin/main and HEAD badge on main
  const defaultBadge = screen.getByText("Predeterminada");
  expect(defaultBadge.classList.contains("sidebar__badge--default")).toBe(true);

  const headBadge = screen.getByText("HEAD");
  expect(headBadge.classList.contains("sidebar__badge--head")).toBe(true);

  // Tag should prioritize version without displaying raw inline commit time
  const tagButton = screen.getByRole("button", { name: /^v1\.0\.0$/ });
  expect(tagButton).toBeInstanceOf(HTMLElement);
  expect(tagButton.getAttribute("title")).toContain("Fecha del commit:");
  expect(tagButton.querySelector(".sidebar__date")).toBeNull();

  // 4. Options menu (…): expand all, collapse all, reset filters
  const optionsBtn = screen.getByRole("button", {
    name: "Opciones de referencias",
  });
  await userEvent.click(optionsBtn);

  // Show-all stays in the quick bar so the same action is not repeated here.
  expect(screen.queryByRole("menuitem", { name: "Mostrar todo" })).toBeNull();

  const collapseAllOption = screen.getByRole("menuitem", {
    name: "Contraer todo",
  });
  await userEvent.click(collapseAllOption);

  // Group sections should now show collapsed indicator ▸
  const localToggle = screen.getByRole("button", { name: /^Local$/ });
  expect(localToggle.textContent).toContain("▸");

  // Re-open options and expand all
  await userEvent.click(optionsBtn);
  const expandAllOption = screen.getByRole("menuitem", {
    name: "Expandir todo",
  });
  await userEvent.click(expandAllOption);
  expect(localToggle.textContent).toContain("▾");
});

it("handles deep folder nesting and long branch names gracefully", async () => {
  const longName =
    "jira-999-very-long-branch-name-for-testing-overflow-handling-in-sidebar";
  getBranches.mockResolvedValue([
    branch({
      name: `feature/deep/nested/level3/level4/${longName}`,
      full_name: `refs/heads/feature/deep/nested/level3/level4/${longName}`,
    }),
  ]);
  getTags.mockResolvedValue([]);

  renderSidebar();

  // Root folder 'feature'
  const featureFolder = await screen.findByRole("button", {
    name: /^feature$/,
  });
  expect(featureFolder).toBeInstanceOf(HTMLElement);

  // Deep folders
  expect(screen.getByRole("button", { name: /^deep$/ })).toBeInstanceOf(
    HTMLElement,
  );
  expect(screen.getByRole("button", { name: /^nested$/ })).toBeInstanceOf(
    HTMLElement,
  );
  expect(screen.getByRole("button", { name: /^level3$/ })).toBeInstanceOf(
    HTMLElement,
  );
  expect(screen.getByRole("button", { name: /^level4$/ })).toBeInstanceOf(
    HTMLElement,
  );

  // Leaf branch displays the short segment name visually and preserves full path in aria-label and title
  const leafBtn = screen.getByRole("button", {
    name: `feature/deep/nested/level3/level4/${longName}`,
  });
  expect(leafBtn).toBeInstanceOf(HTMLElement);
  expect(leafBtn.textContent).toContain(longName);
  expect(leafBtn.getAttribute("title")).toContain(longName);

  // Fold 'nested' and verify its children collapse
  const nestedFolder = screen.getByRole("button", { name: /^nested$/ });
  await userEvent.click(nestedFolder);
  expect(screen.queryByRole("button", { name: /^level3$/ })).toBeNull();
  expect(
    screen.queryByRole("button", {
      name: `feature/deep/nested/level3/level4/${longName}`,
    }),
  ).toBeNull();

  // Expand 'nested' again
  await userEvent.click(nestedFolder);
  expect(screen.getByRole("button", { name: /^level3$/ })).toBeInstanceOf(
    HTMLElement,
  );
});

it("handles detached HEAD in worktree and keyboard navigation with Shift+F10", async () => {
  mockIpc.getRepositoryWorktrees.mockResolvedValue({
    repository_id: "/common/repo.git",
    current_root: "/tmp/repo",
    worktrees: [
      {
        name: "detached-tree",
        root: "/tmp/detached-tree",
        is_main: false,
        is_active: false,
        availability: "available",
        head: { kind: "detached", reference: MAIN_TIP },
        locked: false,
        lock_reason: null,
      },
    ],
  });

  getBranches.mockResolvedValue([
    branch({ name: "main", full_name: "refs/heads/main" }),
  ]);
  getTags.mockResolvedValue([]);

  renderSidebar();

  // Detached HEAD badge in worktree
  const detachedBadge = await screen.findByText("HEAD separado");
  expect(detachedBadge).toBeInstanceOf(HTMLElement);

  // Keyboard navigation on branch item: Shift+F10 opens context menu
  const mainItem = screen.getByRole("button", { name: /^main$/ });
  fireEvent.keyDown(mainItem, { key: "F10", shiftKey: true });

  const onlyThisOption = await screen.findByRole("menuitem", {
    name: "Mostrar solo esta referencia",
  });
  expect(onlyThisOption).toBeInstanceOf(HTMLElement);

  // Close menu with Escape
  fireEvent.keyDown(window, { key: "Escape" });
});

it("renders large reference sets efficiently with correct counts and sorting", async () => {
  const largeBranchList: BranchInfo[] = [
    branch({ name: "main", full_name: "refs/heads/main", is_head: true }),
  ];
  for (let i = 1; i <= 30; i++) {
    largeBranchList.push(
      branch({
        name: `team-a/feature-${String(i).padStart(2, "0")}`,
        full_name: `refs/heads/team-a/feature-${String(i).padStart(2, "0")}`,
        is_head: false,
      }),
    );
    largeBranchList.push(
      branch({
        name: `team-b/bugfix-${String(i).padStart(2, "0")}`,
        full_name: `refs/heads/team-b/bugfix-${String(i).padStart(2, "0")}`,
        is_head: false,
      }),
    );
  }

  getBranches.mockResolvedValue(largeBranchList);
  getTags.mockResolvedValue([]);

  renderSidebar();

  // Group header shows total count (1 main + 30 team-a + 30 team-b = 61)
  const localGroupCount = await screen.findByLabelText("61 de 61 activas");
  expect(localGroupCount).toBeInstanceOf(HTMLElement);

  // Folders exist
  expect(screen.getByRole("button", { name: /^team-a$/ })).toBeInstanceOf(
    HTMLElement,
  );
  expect(screen.getByRole("button", { name: /^team-b$/ })).toBeInstanceOf(
    HTMLElement,
  );

  // Check the folder eye tooltip indicates 30 references
  const teamAEye = screen.getByRole("checkbox", {
    name: "Alternar referencias de team-a",
  });
  expect(teamAEye.getAttribute("aria-checked")).toBe("true");

  // Filter with search: only bugfix-05 matches
  const searchInput = screen.getByRole("searchbox");
  await userEvent.type(searchInput, "bugfix-05");

  const bugfixBtn = screen.getByRole("button", { name: "team-b/bugfix-05" });
  expect(bugfixBtn).toBeInstanceOf(HTMLElement);
  expect(bugfixBtn.textContent).toContain("bugfix-05");
  expect(screen.queryByRole("button", { name: "team-b/bugfix-06" })).toBeNull();
  expect(screen.queryByRole("button", { name: /^team-a$/ })).toBeNull();
});
