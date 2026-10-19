// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BranchInfo, TagInfo } from "../../bindings";
import { createIpcMocks, renderWithQueryClient } from "../../test/test-utils";

const getBranches = vi.fn<() => Promise<BranchInfo[]>>();
const getTags = vi.fn<() => Promise<TagInfo[]>>();
const mockIpc = createIpcMocks(["getRepositoryRefs"] as const);

vi.mock("../../lib/ipc", () => mockIpc);

const { Sidebar } = await import("./Sidebar");
const { resetWorkspace, openTestProject, patchNavigation, activeNavigation } =
  await import("../../test/workspace");

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
  openTestProject({ path: "/tmp/repo", name: "repo" });
  patchNavigation({ selection: { kind: "history" }, revealCommitId: null });
});
afterEach(cleanup);

describe("Sidebar", () => {
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
      },
    ]);
    renderSidebar();

    const tag = await screen.findByRole("button", { name: /v0\.1\.0/ });
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
      },
    ]);
    renderSidebar();

    await userEvent.click(
      await screen.findByRole("button", { name: /v0\.1\.0/ }),
    );

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
