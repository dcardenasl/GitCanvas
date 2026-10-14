// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { WorktreeSnapshot, WorktreeSnapshotRequest } from "../bindings";
import { createQueryClientWrapper } from "../test/test-utils";

const getWorktreeSnapshot = vi.hoisted(() => vi.fn());
vi.mock("../lib/ipc", () => ({ getWorktreeSnapshot }));

const { pollInterval, useWorktreeSnapshot } = await import("./worktree");

function snapshot(revision: string): WorktreeSnapshot {
  const side = (name: "staged" | "unstaged") => ({
    side: name,
    revision,
    files: [],
    total_files: 0,
    next_cursor: null,
    insertions: 0,
    deletions: 0,
  });
  return { revision, staged: side("staged"), unstaged: side("unstaged") };
}

beforeEach(() => {
  getWorktreeSnapshot.mockReset();
});

describe("useWorktreeSnapshot placeholders", () => {
  const FIRST: WorktreeSnapshotRequest = {
    staged_cursor: null,
    unstaged_cursor: null,
    limit: null,
    expected_revision: null,
  };

  it("shows the previous answer of the same project while a new request loads", async () => {
    getWorktreeSnapshot.mockResolvedValueOnce(snapshot("first"));
    getWorktreeSnapshot.mockReturnValueOnce(new Promise(() => undefined));
    const { result, rerender } = renderHook(
      ({ request }) => useWorktreeSnapshot("/projects/a", request),
      {
        wrapper: createQueryClientWrapper(),
        initialProps: { request: FIRST },
      },
    );
    await waitFor(() => {
      expect(result.current.data?.revision).toBe("first");
    });

    rerender({ request: { ...FIRST, limit: 10 } });

    expect(result.current.isPlaceholderData).toBe(true);
    expect(result.current.data?.revision).toBe("first");
  });

  it("never shows another project's files while this one loads", async () => {
    getWorktreeSnapshot.mockResolvedValueOnce(snapshot("project-a"));
    getWorktreeSnapshot.mockReturnValueOnce(new Promise(() => undefined));
    const { result, rerender } = renderHook(
      ({ path }) => useWorktreeSnapshot(path),
      {
        wrapper: createQueryClientWrapper(),
        initialProps: { path: "/projects/a" },
      },
    );
    await waitFor(() => {
      expect(result.current.data?.revision).toBe("project-a");
    });

    rerender({ path: "/projects/b" });

    expect(result.current.data).toBeUndefined();
    expect(result.current.isPlaceholderData).toBe(false);
  });
});

describe("pollInterval", () => {
  it("uses the base interval while polls are cheap", () => {
    expect(pollInterval(5_000, 0)).toBe(5_000);
    expect(pollInterval(5_000, 40)).toBe(5_000);
    expect(pollInterval(2_000, 40)).toBe(2_000);
  });

  it("leaves ten times the cost of a poll before the next one", () => {
    expect(pollInterval(5_000, 800)).toBe(8_000);
    expect(pollInterval(2_000, 1_500)).toBe(15_000);
  });

  it("never waits longer than a minute", () => {
    expect(pollInterval(5_000, 60_000)).toBe(60_000);
  });
});
