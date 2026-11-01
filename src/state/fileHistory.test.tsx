// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { FileHistoryPage, FileHistoryRow } from "../bindings";
import { createQueryClientWrapper } from "../test/test-utils";
import { useFileHistory } from "./fileHistory";
import type { FileHistoryView } from "./navigation";

const getFileHistory = vi.hoisted(() =>
  vi.fn<(root: string, request: unknown) => Promise<FileHistoryPage>>(),
);
vi.mock("../lib/ipc", () => ({ getFileHistory }));

const START = "a".repeat(40);
const VIEW: FileHistoryView = {
  path: "src/app.ts",
  startCommitId: START,
  selectedCommitId: null,
  stale: false,
};

function row(id: string): FileHistoryRow {
  return {
    commit: {
      id: id.repeat(40),
      summary: id,
      message: id,
      parents: [],
      author_name: "Test",
      author_email: "test@example.com",
      author_time: "1",
      commit_time: "1",
    },
    change: "modified",
    is_merge: false,
    path_at_commit: "src/app.ts",
    renamed_from: null,
    lineage: null,
  };
}

function page(rows: FileHistoryRow[], next: string | null): FileHistoryPage {
  return {
    rows,
    next_cursor: next,
    truncation: null,
    focus: null,
    start: START,
    shallow: false,
    limits: {
      max_page_size: 200,
      max_examined: 20000,
      max_frontier: 256,
      max_renames: 32,
      max_rename_search_deltas: 2000,
    },
  };
}

beforeEach(() => {
  getFileHistory.mockReset();
});

it("loads nothing without an open view", () => {
  const { result } = renderHook(() => useFileHistory("/repo", null), {
    wrapper: createQueryClientWrapper(),
  });
  expect(getFileHistory).not.toHaveBeenCalled();
  expect(result.current.rows).toEqual([]);
});

it("pages through the history from its start commit and concatenates the rows", async () => {
  getFileHistory
    .mockResolvedValueOnce(page([row("b")], "cursor-1"))
    .mockResolvedValueOnce(page([row("c")], null));
  const { result } = renderHook(() => useFileHistory("/repo", VIEW), {
    wrapper: createQueryClientWrapper(),
  });
  await waitFor(() => {
    expect(result.current.rows).toHaveLength(1);
  });
  expect(getFileHistory).toHaveBeenLastCalledWith("/repo", {
    path: "src/app.ts",
    start: START,
    limit: 200,
    cursor: null,
    focus_commit: null,
  });
  expect(result.current.hasNextPage).toBe(true);
  act(() => {
    result.current.fetchNextPage();
  });
  await waitFor(() => {
    expect(result.current.rows).toHaveLength(2);
  });
  expect(getFileHistory).toHaveBeenLastCalledWith("/repo", {
    path: "src/app.ts",
    start: START,
    limit: 200,
    cursor: "cursor-1",
    focus_commit: null,
  });
  expect(result.current.hasNextPage).toBe(false);
});

it("keeps each project's history apart even for the same path and start", async () => {
  getFileHistory.mockImplementation((root) =>
    Promise.resolve(page([row(root === "/repo/a" ? "a" : "b")], null)),
  );
  const client = createQueryClientWrapper();
  const first = renderHook(() => useFileHistory("/repo/a", VIEW), {
    wrapper: client,
  });
  const second = renderHook(() => useFileHistory("/repo/b", VIEW), {
    wrapper: client,
  });
  await waitFor(() => {
    expect(first.result.current.rows).toHaveLength(1);
  });
  await waitFor(() => {
    expect(second.result.current.rows).toHaveLength(1);
  });
  expect(first.result.current.rows[0]?.commit.summary).toBe("a");
  expect(second.result.current.rows[0]?.commit.summary).toBe("b");
});

it("reports the bound that ended the last loaded page", async () => {
  getFileHistory.mockResolvedValueOnce({
    ...page([row("b")], null),
    truncation: "work_limit",
    shallow: true,
  });
  const { result } = renderHook(() => useFileHistory("/repo", VIEW), {
    wrapper: createQueryClientWrapper(),
  });
  await waitFor(() => {
    expect(result.current.rows).toHaveLength(1);
  });
  expect(result.current.truncation).toBe("work_limit");
  expect(result.current.shallow).toBe(true);
});
