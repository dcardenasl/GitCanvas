// @vitest-environment jsdom
import { waitFor, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

import type {
  HistoryPage,
  RepositoryRefsSnapshot,
  RepositoryWorktreesSnapshot,
} from "../bindings";
import { queryKeys } from "./queryKeys";
import { useHistory } from "./history";
import { useWorkspace } from "./workspace";
import {
  createQueryClientWrapper,
  createTestQueryClient,
} from "../test/test-utils";
import { resetWorkspace } from "../test/workspace";

const getCommits =
  vi.fn<(path: string, request: unknown) => Promise<HistoryPage>>();
vi.mock("../lib/ipc", () => ({
  getCommits: (path: string, request: unknown) => getCommits(path, request),
  getRepositoryRefs: vi.fn(),
  getRepositoryWorktrees: vi.fn(),
}));

const refs: RepositoryRefsSnapshot = {
  branches: [
    {
      name: "main",
      full_name: "refs/heads/main",
      target: "1",
      upstream: null,
      symbolic_target: null,
      is_remote: false,
      is_head: true,
      is_symbolic: false,
    },
    {
      name: "side",
      full_name: "refs/heads/side",
      target: "2",
      upstream: null,
      symbolic_target: null,
      is_remote: false,
      is_head: false,
      is_symbolic: false,
    },
  ],
  tags: [
    {
      name: "v1",
      target: "3",
      commit_id: "3",
      is_annotated: false,
      commit_time: "0",
    },
  ],
  head: "1",
  head_reference: "refs/heads/main",
  roots: ["1", "2", "3"],
};
const worktrees: RepositoryWorktreesSnapshot = {
  repository_id: "/common/repo.git",
  current_root: "/repo",
  worktrees: [
    {
      name: "repo",
      root: "/repo",
      is_main: true,
      is_active: true,
      availability: "available",
      head: { kind: "branch", reference: "refs/heads/main" },
      locked: false,
      lock_reason: null,
    },
  ],
};

beforeEach(() => {
  resetWorkspace();
  getCommits.mockReset().mockResolvedValue({
    commits: [],
    next_cursor: null,
    roots: ["1"],
    references: ["HEAD", "refs/heads/main"],
  });
  useWorkspace.getState().setReferenceFilters({
    path: "/repo",
    excluded: ["refs/heads/side", "refs/tags/v1"],
    search: "",
  });
});

it("sends the selected full reference names to Rust instead of filtering loaded rows", async () => {
  const client = createTestQueryClient();
  client.setQueryData(queryKeys.refs("/repo"), refs);
  client.setQueryData(queryKeys.repositoryWorktrees("/repo"), worktrees);
  renderHook(() => useHistory("/repo"), {
    wrapper: createQueryClientWrapper(client),
  });

  await waitFor(() => {
    expect(getCommits).toHaveBeenCalled();
  });
  expect(getCommits).toHaveBeenCalledWith(
    "/repo",
    expect.objectContaining({
      references: ["HEAD", "refs/heads/main"],
      cursor: null,
      roots: null,
    }),
  );
});
