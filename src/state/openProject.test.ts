import { beforeEach, describe, expect, it, vi } from "vitest";

import { activeRoot, resetWorkspace } from "../test/workspace";

const openRepository = vi.hoisted(() => vi.fn());
vi.mock("../lib/ipc", () => ({ openRepository }));

const { openProjectAt } = await import("./openProject");
const { useWorkspace } = await import("./workspace");

beforeEach(() => {
  openRepository.mockReset();
  resetWorkspace();
});

function roots(): string[] {
  return useWorkspace.getState().tabs.map((tab) => tab.repository.path);
}

describe("openProjectAt", () => {
  it("names the tab by the root the backend answers with, not by the text given", async () => {
    openRepository.mockResolvedValue({ path: "/real/repo", name: "repo" });

    expect(await openProjectAt("/alias/to/repo")).toBe("opened");

    expect(openRepository).toHaveBeenCalledWith("/alias/to/repo");
    expect(roots()).toEqual(["/real/repo"]);
  });

  it("lands two aliases of one repository on the same tab", async () => {
    openRepository.mockResolvedValue({ path: "/real/repo", name: "repo" });

    await openProjectAt("/alias/one");
    expect(await openProjectAt("/alias/two")).toBe("activated");

    expect(roots()).toEqual(["/real/repo"]);
  });

  it("gives a worktree of the same repository its own tab", async () => {
    openRepository.mockResolvedValueOnce({ path: "/work/repo", name: "repo" });
    openRepository.mockResolvedValueOnce({
      path: "/work/repo-feature",
      name: "repo-feature",
    });

    await openProjectAt("/work/repo");
    await openProjectAt("/work/repo-feature");

    expect(roots()).toEqual(["/work/repo", "/work/repo-feature"]);
    expect(activeRoot()).toBe("/work/repo-feature");
  });

  it("opens nothing and rethrows when the backend refuses the folder", async () => {
    openRepository.mockRejectedValue(new Error("not a repository"));

    await expect(openProjectAt("/tmp/plain")).rejects.toThrow(
      "not a repository",
    );

    expect(roots()).toEqual([]);
  });

  it("reports the limit instead of opening past it", async () => {
    useWorkspace.setState({
      limits: { max_tabs: 1, max_favorites: 200, max_recents: 20 },
    });
    openRepository.mockResolvedValueOnce({ path: "/a", name: "a" });
    openRepository.mockResolvedValueOnce({ path: "/b", name: "b" });

    await openProjectAt("/a");
    expect(await openProjectAt("/b")).toBe("limit");

    expect(roots()).toEqual(["/a"]);
  });
});
