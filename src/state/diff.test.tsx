// @vitest-environment jsdom
import type { QueryClient } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CommitDiff } from "../bindings";
import {
  createIpcMocks,
  createQueryClientWrapper,
  createTestQueryClient,
} from "../test/test-utils";

const mockIpc = createIpcMocks(["getCommitDiff"] as const);
const { getCommitDiff } = mockIpc;
vi.mock("../lib/ipc", () => mockIpc);

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
let wrapper: ReturnType<typeof createQueryClientWrapper>;

beforeEach(() => {
  vi.clearAllMocks();
  client = createTestQueryClient();
  wrapper = createQueryClientWrapper(client);
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
      file_path: null,
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
      expect(first.result.current.data).toEqual(DIFF);
      expect(second.result.current.data).toEqual(DIFF);
    });
    expect(getCommitDiff).toHaveBeenCalledTimes(1);
  });
});
