// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

import type { RepositoryWorktreesSnapshot } from "../bindings";
import {
  createQueryClientWrapper,
  createTestQueryClient,
} from "../test/test-utils";

const getRepositoryWorktrees =
  vi.fn<(path: string) => Promise<RepositoryWorktreesSnapshot>>();
vi.mock("../lib/ipc", () => ({
  getRepositoryWorktrees: (path: string) => getRepositoryWorktrees(path),
}));

const { useRepositoryWorktrees } = await import("./repositoryWorktrees");

function snapshot(root: string): RepositoryWorktreesSnapshot {
  return {
    repository_id: `${root}/.git`,
    current_root: root,
    worktrees: [
      {
        name: root.split("/").at(-1) ?? root,
        root,
        is_main: true,
        is_active: true,
        availability: "available",
        head: { kind: "unknown" },
        locked: false,
        lock_reason: null,
      },
    ],
  };
}

beforeEach(() => {
  getRepositoryWorktrees
    .mockReset()
    .mockImplementation((path) => Promise.resolve(snapshot(path)));
});

it("refreshes cached inventory whenever a worktree becomes active again", async () => {
  const client = createTestQueryClient();
  const { rerender } = renderHook(({ path }) => useRepositoryWorktrees(path), {
    wrapper: createQueryClientWrapper(client),
    initialProps: { path: "/repo/main" },
  });

  await waitFor(() => {
    expect(getRepositoryWorktrees).toHaveBeenCalledTimes(1);
  });
  rerender({ path: "/repo/linked" });
  await waitFor(() => {
    expect(getRepositoryWorktrees).toHaveBeenCalledTimes(2);
  });
  rerender({ path: "/repo/main" });
  await waitFor(() => {
    expect(getRepositoryWorktrees).toHaveBeenCalledTimes(3);
  });
  expect(getRepositoryWorktrees).toHaveBeenLastCalledWith("/repo/main");
});
