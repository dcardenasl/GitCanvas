// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FileHistoryPage } from "../bindings";
import {
  fileHistoryPage as page,
  fileHistoryRow as row,
} from "../test/fileHistory";
import { createQueryClientWrapper } from "../test/test-utils";
import { fileHistoryUnavailable, useFileHistory } from "./fileHistory";
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
  followsHead: false,
};

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
  expect(first.result.current.rows[0]?.commit.summary).toBe("change a");
  expect(second.result.current.rows[0]?.commit.summary).toBe("change b");
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

describe("fileHistoryUnavailable", () => {
  it("lets any path with a commit to start from be opened", () => {
    expect(fileHistoryUnavailable("src/app.ts", START)).toBeNull();
  });

  it("explains that a repository without commits has nothing to start from", () => {
    expect(fileHistoryUnavailable("src/app.ts", null)).toBe("noCommits");
  });

  it("refuses a path whose exact name was lost to a replacement character", () => {
    expect(fileHistoryUnavailable("caf\uFFFD.txt", START)).toBe("notUtf8");
  });
});
