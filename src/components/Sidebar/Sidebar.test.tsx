// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
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

function renderSidebar() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <Sidebar />
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
    selectedCommitId: null,
    revealCommitId: null,
  });
});
afterEach(cleanup);

describe("Sidebar", () => {
  it("takes you to the tip of the branch you choose", async () => {
    renderSidebar();

    await userEvent.click(await screen.findByRole("button", { name: /^main/ }));

    const state = useSession.getState();
    expect(state.selectedCommitId).toBe(MAIN_TIP);
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
    useSession.setState({ selectedCommitId: DEV_TIP });
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
});
