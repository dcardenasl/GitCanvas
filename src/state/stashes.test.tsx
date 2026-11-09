import type * as Ipc from "../lib/ipc";
// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createQueryClientWrapper,
  createTestQueryClient,
} from "../test/test-utils";
import { stashEntry, stashPage } from "../test/stash";
import {
  activeNavigation,
  openTestProject,
  resetWorkspace,
} from "../test/workspace";
import { navigationActionsFor } from "./workspace";
import { queryKeys } from "./queryKeys";
import { IpcError } from "../lib/ipc";
import { useStashAnchors, useStashes, useStashRuntime } from "./stashes";

const ipc = vi.hoisted(() => ({
  getStashes: vi.fn<typeof Ipc.getStashes>(),
  getStashFiles: vi.fn<typeof Ipc.getStashFiles>(),
  getStashFingerprint: vi.fn<typeof Ipc.getStashFingerprint>(),
  getStashAnchors: vi.fn<typeof Ipc.getStashAnchors>(),
}));
vi.mock("../lib/ipc", async (original) => ({
  ...(await original<typeof Ipc>()),
  ...ipc,
}));

beforeEach(() => {
  vi.clearAllMocks();
  resetWorkspace();
  openTestProject();
  ipc.getStashes.mockResolvedValue(stashPage());
  ipc.getStashFingerprint.mockResolvedValue({ revision: "first" });
  ipc.getStashAnchors.mockResolvedValue({
    revision: "first",
    entries: [],
    unresolved: 0,
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("stash session queries", () => {
  it("recovers a stale continuation from the first page without losing selection", async () => {
    const entry = stashEntry();
    navigationActionsFor("/tmp/repo").openStash(entry);
    ipc.getStashes.mockImplementation(async (_root, request) => {
      await Promise.resolve();
      if (request.cursor !== null)
        throw new IpcError({ kind: "StaleCursor", message: "reflog moved" });
      return stashPage({
        entries: [entry],
        total: 2,
        total_matches: 2,
        selected_present: true,
        selected_entry: entry,
        next_cursor: "next",
      });
    });
    const client = createTestQueryClient();
    const { result } = renderHook(() => useStashes("/tmp/repo", ""), {
      wrapper: createQueryClientWrapper(client),
    });
    await waitFor(() => {
      expect(result.current.entries).toHaveLength(1);
    });
    await act(async () => {
      await result.current.fetchNextPage();
    });
    await waitFor(() => {
      expect(
        ipc.getStashes.mock.calls.filter(
          ([, request]) => request.cursor === null,
        ).length,
      ).toBeGreaterThanOrEqual(2);
    });
    expect(activeNavigation().stash?.entry.stash_id).toBe(entry.stash_id);
    await waitFor(() => {
      expect(result.current.error).toBeNull();
    });
  });

  it("keeps only current search and unfiltered variants and prunes old file payloads", async () => {
    const client = createTestQueryClient();
    const { rerender } = renderHook(
      ({ search }) => {
        useStashRuntime("/tmp/repo", false);
        return useStashes("/tmp/repo", search);
      },
      {
        initialProps: { search: "" },
        wrapper: createQueryClientWrapper(client),
      },
    );
    for (const search of ["one", "two", "three"]) {
      rerender({ search });
      await waitFor(() => {
        expect(ipc.getStashes).toHaveBeenCalledWith(
          "/tmp/repo",
          expect.objectContaining({ search }),
        );
      });
    }
    expect(
      client
        .getQueryCache()
        .findAll({ queryKey: queryKeys.stashes("/tmp/repo") }).length,
    ).toBeLessThanOrEqual(2);
    for (const id of ["a", "b", "c"]) {
      client.setQueryData(queryKeys.stashFiles("/tmp/repo", id, "all"), {
        bytes: "heavy",
      });
      act(() => {
        navigationActionsFor("/tmp/repo").openStash(
          stashEntry({ stash_id: id }),
        );
      });
    }
    await waitFor(() => {
      expect(
        client
          .getQueryCache()
          .findAll({ queryKey: ["stash-files", "/tmp/repo"] }),
      ).toHaveLength(1);
    });
  });

  it("does not read an unverified root and stops polling it after deactivation", async () => {
    const client = createTestQueryClient();
    const { rerender } = renderHook(({ root }) => useStashRuntime(root, true), {
      initialProps: { root: null as string | null },
      wrapper: createQueryClientWrapper(client),
    });
    expect(ipc.getStashFingerprint).not.toHaveBeenCalled();
    rerender({ root: "/tmp/repo" });
    await waitFor(() => {
      expect(ipc.getStashFingerprint).toHaveBeenCalledTimes(1);
    });
    rerender({ root: null });
    vi.useFakeTimers();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(ipc.getStashFingerprint).toHaveBeenCalledTimes(1);
  });

  it("refreshes only inventory when the backup fingerprint changes", async () => {
    const client = createTestQueryClient();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useStashRuntime("/tmp/repo", true), {
      wrapper: createQueryClientWrapper(client),
    });
    await waitFor(() => {
      expect(result.current.data?.revision).toBe("first");
    });
    act(() => {
      client.setQueryData(queryKeys.stashFingerprint("/tmp/repo"), {
        revision: "second",
      });
    });
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalled();
    });
    expect(
      invalidate.mock.calls.every(([filters]) =>
        String(filters?.queryKey?.[0]).startsWith("stash-"),
      ),
    ).toBe(true);
  });

  it("keeps the last valid graph index available when a refresh fails", async () => {
    const entry = stashEntry();
    const anchor = { entry, base_commit_id: "b".repeat(40) };
    ipc.getStashAnchors.mockResolvedValueOnce({
      revision: "first",
      entries: [anchor],
      unresolved: 0,
    });
    const client = createTestQueryClient();
    const { result } = renderHook(() => useStashAnchors("/tmp/repo"), {
      wrapper: createQueryClientWrapper(client),
    });
    await waitFor(() => {
      expect(result.current.data?.entries).toEqual([anchor]);
    });

    ipc.getStashAnchors.mockRejectedValue(
      new IpcError({ kind: "Io", message: "unavailable" }),
    );
    let refreshed:
      Awaited<ReturnType<typeof result.current.refetch>> | undefined;
    await act(async () => {
      refreshed = await result.current.refetch();
    });
    expect(refreshed?.isError).toBe(true);
    expect(ipc.getStashAnchors.mock.calls.length).toBeGreaterThan(1);
    expect(result.current.data?.entries).toEqual([anchor]);
  });
});
