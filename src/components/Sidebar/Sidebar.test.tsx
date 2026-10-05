// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BranchInfo, TagInfo } from "../../bindings";

const getBranches = vi.fn<(path: string) => Promise<BranchInfo[]>>();
const getTags = vi.fn<(path: string) => Promise<TagInfo[]>>();

vi.mock("../../lib/ipc", () => ({
  getBranches: (path: string) => getBranches(path),
  getTags: (path: string) => getTags(path),
}));

const { Sidebar } = await import("./Sidebar");
const { useSession } = await import("../../state/session");

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
    ...overrides,
  };
}

function renderSidebar(onCheckout?: (branch: string) => void) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <Sidebar {...(onCheckout === undefined ? {} : { onCheckout })} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
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
  useSession.setState({
    repository: { path: "/tmp/repo", name: "repo" },
    selection: { kind: "history" },
    revealCommitId: null,
  });
});
afterEach(cleanup);

describe("Sidebar", () => {
  it("takes you to the tip of the branch you choose", async () => {
    renderSidebar();

    await userEvent.click(await screen.findByRole("button", { name: /^main/ }));

    const state = useSession.getState();
    expect(state.selection).toEqual({
      kind: "commit",
      commitId: MAIN_TIP,
      filePath: null,
    });
    expect(state.revealCommitId).toBe(MAIN_TIP);
  });

  it("separates local branches from remote ones", async () => {
    renderSidebar();

    expect(await screen.findByText("Local")).toBeDefined();
    expect(screen.getByText("Remotas")).toBeDefined();
    expect(screen.getByRole("button", { name: /origin\/main/ })).toBeDefined();
  });

  it("marks the checked-out branch", async () => {
    renderSidebar();

    const dev = await screen.findByRole("button", { name: /^dev/ });
    expect(dev.textContent).toContain("HEAD");
  });

  it("marks the ref whose commit is selected", async () => {
    useSession.setState({
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

    expect(useSession.getState().revealCommitId).toBe(MAIN_TIP);
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
      await userEvent.keyboard("{Enter}");

      expect(onCheckout).toHaveBeenCalledWith("main");
    });

    it("offers nothing on the branch that is already checked out", async () => {
      renderSidebar(vi.fn());

      fireEvent.contextMenu(
        await screen.findByRole("button", { name: /^dev/ }),
      );

      expect(screen.queryByRole("menu")).toBeNull();
    });

    it("offers nothing on remote branches or tags", async () => {
      renderSidebar(vi.fn());

      fireEvent.contextMenu(
        await screen.findByRole("button", { name: /origin\/main/ }),
      );

      expect(screen.queryByRole("menu")).toBeNull();
    });

    it("offers no checkout when the caller cannot perform one", async () => {
      renderSidebar();

      fireEvent.contextMenu(
        await screen.findByRole("button", { name: /^main/ }),
      );

      expect(screen.queryByRole("menu")).toBeNull();
    });
  });
});
