// @vitest-environment jsdom
import type { QueryClient } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BranchInfo, TagInfo } from "../bindings";
import {
  createIpcMocks,
  createQueryClientWrapper,
  createTestQueryClient,
} from "../test/test-utils";

const getBranches = vi.fn<() => Promise<BranchInfo[]>>();
const getTags = vi.fn<() => Promise<TagInfo[]>>();
const mockIpc = createIpcMocks(["getRepositoryRefs"] as const);
vi.mock("../lib/ipc", () => mockIpc);

const { useBranches, useCurrentBranch, useRefsByCommit } =
  await import("./refs");

const TIP = "1".repeat(40);
const OTHER = "2".repeat(40);

function branch(overrides: Partial<BranchInfo>): BranchInfo {
  return {
    name: "main",
    full_name: "refs/heads/main",
    target: TIP,
    is_remote: false,
    is_head: false,
    is_symbolic: false,
    upstream: null,
    symbolic_target: null,
    ...overrides,
  };
}

let client: QueryClient;
let wrapper: ReturnType<typeof createQueryClientWrapper>;

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
  client = createTestQueryClient();
  wrapper = createQueryClientWrapper(client);
  getTags.mockResolvedValue([]);
});

describe("useCurrentBranch", () => {
  it("is the checked-out local branch", async () => {
    getBranches.mockResolvedValue([
      branch({ name: "main" }),
      branch({ name: "dev", full_name: "refs/heads/dev", is_head: true }),
    ]);

    const { result } = renderHook(() => useCurrentBranch("/tmp/repo"), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current).toBe("dev");
    });
  });

  it("is null on a detached HEAD, where no branch is checked out", async () => {
    getBranches.mockResolvedValue([branch({ name: "main" })]);

    const { result } = renderHook(
      () => ({
        branches: useBranches("/tmp/repo"),
        current: useCurrentBranch("/tmp/repo"),
      }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.branches.isSuccess).toBe(true);
    });
    expect(result.current.current).toBeNull();
  });

  it("never mistakes a remote branch for the current one", async () => {
    getBranches.mockResolvedValue([
      branch({ name: "origin/main", is_remote: true, is_head: true }),
    ]);

    const { result } = renderHook(
      () => ({
        branches: useBranches("/tmp/repo"),
        current: useCurrentBranch("/tmp/repo"),
      }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.branches.isSuccess).toBe(true);
    });
    expect(result.current.current).toBeNull();
  });

  it("reads nothing without a repository", () => {
    const { result } = renderHook(() => useCurrentBranch(null), { wrapper });

    expect(result.current).toBeNull();
    expect(getBranches).not.toHaveBeenCalled();
  });
});

describe("useRefsByCommit", () => {
  it("groups branches and tags by commit, locals first then remotes then tags", async () => {
    getBranches.mockResolvedValue([
      branch({ name: "origin/main", is_remote: true }),
      branch({ name: "zeta", full_name: "refs/heads/zeta" }),
      branch({ name: "alpha", full_name: "refs/heads/alpha", is_head: true }),
      branch({ name: "other", target: OTHER }),
    ]);
    getTags.mockResolvedValue([
      {
        name: "v1",
        target: TIP,
        commit_id: TIP,
        is_annotated: false,
        commit_time: "0",
      },
      {
        name: "v-blob",
        target: OTHER,
        commit_id: null,
        is_annotated: true,
        commit_time: null,
      },
    ]);

    const { result } = renderHook(() => useRefsByCommit("/tmp/repo"), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.get(TIP)).toHaveLength(4);
    });
    expect(
      result.current.get(TIP)?.map((ref) => `${ref.kind}:${ref.name}`),
    ).toEqual(["local:alpha", "local:zeta", "remote:origin/main", "tag:v1"]);
    expect(result.current.get(TIP)?.[0]?.isHead).toBe(true);
    expect(mockIpc.getRepositoryRefs).toHaveBeenCalledTimes(1);
    // A tag that points at no commit has no row to sit on.
    expect(result.current.get(OTHER)?.map((ref) => ref.name)).toEqual([
      "other",
    ]);
  });
});
