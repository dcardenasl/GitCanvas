// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CommitDiff } from "../bindings";

const getCommitDiff =
  vi.fn<(path: string, request: unknown) => Promise<CommitDiff>>();
vi.mock("../lib/ipc", () => ({
  getCommitDiff: (path: string, request: unknown) =>
    getCommitDiff(path, request),
}));

const { useCommitDiff } = await import("./diff");

const DIFF: CommitDiff = {
  commit_id: "a".repeat(40),
  parent_id: null,
  files: [],
  insertions: 0,
  deletions: 0,
  is_merge: false,
};

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client }, children);
}

beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  getCommitDiff.mockResolvedValue(DIFF);
});

describe("useCommitDiff", () => {
  it("reads nothing until both a repository and a commit are chosen", () => {
    renderHook(() => useCommitDiff("/tmp/repo", null), { wrapper });
    renderHook(() => useCommitDiff(null, DIFF.commit_id), { wrapper });

    expect(getCommitDiff).not.toHaveBeenCalled();
  });

  it("asks for the commit, expanding the requested file", async () => {
    const { result } = renderHook(
      () => useCommitDiff("/tmp/repo", DIFF.commit_id, "big.txt"),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.data).toEqual(DIFF);
    });
    expect(getCommitDiff).toHaveBeenCalledWith("/tmp/repo", {
      commit_id: DIFF.commit_id,
      expand_path: "big.txt",
    });
  });

  it("shares one request between every view of the same commit", async () => {
    const first = renderHook(() => useCommitDiff("/tmp/repo", DIFF.commit_id), {
      wrapper,
    });
    const second = renderHook(
      () => useCommitDiff("/tmp/repo", DIFF.commit_id),
      {
        wrapper,
      },
    );

    await waitFor(() => {
      expect(first.result.current.data).toBeDefined();
      expect(second.result.current.data).toBeDefined();
    });
    expect(getCommitDiff).toHaveBeenCalledTimes(1);
  });
});
