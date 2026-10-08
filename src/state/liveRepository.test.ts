// @vitest-environment jsdom
import type { QueryClient } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createIpcMocks,
  createQueryClientWrapper,
  createTestQueryClient,
} from "../test/test-utils";
import { queryKeys } from "./queryKeys";

type Handler = (event: {
  payload: {
    path: string;
    generation: number;
    kind: "Metadata" | "Worktree" | { Degraded: { message: string } };
  };
}) => void;

let handler: Handler | null = null;
const stop = vi.fn();
const operationOrder: string[] = [];
const mockIpc = createIpcMocks([
  "watchRepository",
  "unwatchRepository",
  "getWorktreeFingerprint",
  "onRepositoryChanged",
] as const);
const {
  watchRepository,
  unwatchRepository,
  getWorktreeFingerprint,
  onRepositoryChanged,
} = mockIpc;

vi.mock("../lib/ipc", () => mockIpc);

const { useLiveRepository } = await import("./liveRepository");

let client: QueryClient;
let wrapper: ReturnType<typeof createQueryClientWrapper>;

beforeEach(() => {
  vi.clearAllMocks();
  handler = null;
  operationOrder.length = 0;
  client = createTestQueryClient();
  wrapper = createQueryClientWrapper(client);
  watchRepository.mockImplementation(() => {
    operationOrder.push("watch");
    return Promise.resolve(null);
  });
  unwatchRepository.mockResolvedValue(null);
  getWorktreeFingerprint.mockResolvedValue({ revision: "revision" });
  onRepositoryChanged.mockImplementation((fn) => {
    operationOrder.push("listen");
    handler = fn as Handler;
    return Promise.resolve(stop);
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  client.clear();
});

describe("useLiveRepository", () => {
  it("subscribes before starting the watch and uses a unique generation", async () => {
    renderHook(
      () => {
        useLiveRepository("/tmp/repo");
      },
      { wrapper },
    );

    await waitFor(() => {
      expect(watchRepository).toHaveBeenCalledTimes(1);
    });
    expect(operationOrder).toEqual(["listen", "watch"]);
    const request = watchRepository.mock.calls[0]?.[0] as {
      path: string;
      generation: number;
    };
    expect(request.path).toBe("/tmp/repo");
    expect(Number.isSafeInteger(request.generation)).toBe(true);
  });

  it("watches nothing when no repository is open", () => {
    renderHook(
      () => {
        useLiveRepository(null);
      },
      { wrapper },
    );

    expect(watchRepository).not.toHaveBeenCalled();
  });

  it("re-reads the history and refs when the repository changes", async () => {
    const invalidate = vi.spyOn(client, "invalidateQueries");
    renderHook(
      () => {
        useLiveRepository("/tmp/repo");
      },
      { wrapper },
    );

    // Let the listener subscription resolve.
    await Promise.resolve();
    const generation = (
      watchRepository.mock.calls[0]?.[0] as { generation: number }
    ).generation;
    handler?.({
      payload: { path: "/tmp/repo", generation, kind: "Metadata" },
    });

    const keys = invalidate.mock.calls.map((call) => call[0]?.queryKey?.[0]);
    expect(keys).toContain("history");
    expect(keys).toContain("branches");
    expect(keys).toContain("tags");
    expect(keys).not.toContain("worktree");
    expect(keys).not.toContain("worktree-file-diff");
  });

  it("invalidates only local queries for a working-tree change", async () => {
    // A commit's diff really is immutable once written; discarding it on every
    // change would re-read work that cannot have changed.
    const invalidate = vi.spyOn(client, "invalidateQueries");
    renderHook(
      () => {
        useLiveRepository("/tmp/repo");
      },
      { wrapper },
    );

    await Promise.resolve();
    const generation = (
      watchRepository.mock.calls[0]?.[0] as { generation: number }
    ).generation;
    handler?.({
      payload: { path: "/tmp/repo", generation, kind: "Worktree" },
    });

    const keys = invalidate.mock.calls.map((call) => call[0]?.queryKey?.[0]);
    expect(keys).toContain("worktree");
    expect(keys).toContain("worktree-file-diff");
    expect(keys).not.toContain("diff");
    expect(keys).not.toContain("file");
  });

  it("stops watching when the repository is closed", async () => {
    const { unmount } = renderHook(
      () => {
        useLiveRepository("/tmp/repo");
      },
      { wrapper },
    );

    await waitFor(() => {
      expect(watchRepository).toHaveBeenCalledTimes(1);
    });
    unmount();

    // A watch that outlives its window keeps invalidating caches for a
    // repository nobody is looking at.
    const generation = (
      watchRepository.mock.calls[0]?.[0] as { generation: number }
    ).generation;
    await waitFor(() => {
      expect(unwatchRepository).toHaveBeenCalledWith(generation);
    });
  });

  it("keeps working when the watch cannot be established", async () => {
    // Network volumes and restrictive sandboxes refuse watches; the window
    // must still open.
    watchRepository.mockRejectedValue(new Error("permission denied"));

    expect(() => {
      renderHook(
        () => {
          useLiveRepository("/tmp/repo");
        },
        { wrapper },
      );
    }).not.toThrow();
    await Promise.resolve();
  });

  it("reports starting until the watch is established, then ready", async () => {
    const { result } = renderHook(() => useLiveRepository("/tmp/repo"), {
      wrapper,
    });

    expect(result.current.status.kind).toBe("starting");
    await waitFor(() => {
      expect(result.current.status.kind).toBe("ready");
    });
  });

  it("reports the reason when the watch cannot be established", async () => {
    watchRepository.mockRejectedValue(new Error("permission denied"));
    const { result } = renderHook(() => useLiveRepository("/tmp/repo"), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.status).toEqual({
        kind: "degraded",
        message: "permission denied",
      });
    });
  });

  it("schedules a degraded watcher retry after thirty seconds", async () => {
    const timeoutSpy = vi.spyOn(globalThis, "setTimeout");
    watchRepository.mockRejectedValueOnce(new Error("too many watches"));
    const { result } = renderHook(() => useLiveRepository("/tmp/repo"), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.status.kind).toBe("degraded");
    });
    expect(timeoutSpy.mock.calls).toContainEqual([
      expect.any(Function),
      30_000,
    ]);
  });

  it("invalidates local queries when the worktree fingerprint changes", async () => {
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { worktreeFingerprint, worktree, worktreeFileDiff } = queryKeys;
    const fingerprintKey = worktreeFingerprint("/tmp/repo");
    const { result } = renderHook(() => useLiveRepository("/tmp/repo"), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.status.kind).toBe("ready");
      expect(client.getQueryData(fingerprintKey)).toEqual({
        revision: "revision",
      });
    });

    client.setQueryData(fingerprintKey, { revision: "changed" });

    await waitFor(() => {
      const keys = invalidate.mock.calls.map(
        ([filters]) => filters?.queryKey?.[0],
      );
      expect(keys).toContain("worktree");
      expect(keys).toContain("worktree-file-diff");
      expect(keys).not.toContain("history");
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: worktree("/tmp/repo"),
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: worktreeFileDiff("/tmp/repo"),
    });
  });

  it("summarizes watcher degradation events in Spanish", async () => {
    const { result } = renderHook(() => useLiveRepository("/tmp/repo"), {
      wrapper,
    });
    await waitFor(() => {
      expect(watchRepository).toHaveBeenCalledTimes(1);
    });
    const generation = (
      watchRepository.mock.calls[0]?.[0] as { generation: number }
    ).generation;
    act(() => {
      handler?.({
        payload: {
          path: "/tmp/repo",
          generation,
          kind: { Degraded: { message: "watch failed" } },
        },
      });
    });
    expect(result.current.status).toEqual({
      kind: "degraded",
      message: "La observación del repositorio está degradada: watch failed",
    });
  });

  it("does not replace an early degraded event with watch-ready", async () => {
    let finishWatch: () => void = () => undefined;
    watchRepository.mockReturnValue(
      new Promise<null>((resolve) => {
        finishWatch = () => {
          resolve(null);
        };
      }),
    );
    const { result } = renderHook(() => useLiveRepository("/tmp/repo"), {
      wrapper,
    });
    await waitFor(() => {
      expect(watchRepository).toHaveBeenCalledTimes(1);
    });
    const generation = (
      watchRepository.mock.calls[0]?.[0] as { generation: number }
    ).generation;

    act(() => {
      handler?.({
        payload: {
          path: "/tmp/repo",
          generation,
          kind: { Degraded: { message: "early watch failure" } },
        },
      });
    });
    await act(async () => {
      finishWatch();
      await Promise.resolve();
    });

    expect(result.current.status).toEqual({
      kind: "degraded",
      message:
        "La observación del repositorio está degradada: early watch failure",
    });
  });

  it("assigns different generations to separate hook instances", async () => {
    const first = renderHook(() => useLiveRepository("/tmp/one"), { wrapper });
    const second = renderHook(() => useLiveRepository("/tmp/two"), { wrapper });
    await waitFor(() => {
      expect(watchRepository).toHaveBeenCalledTimes(2);
    });
    const generations = watchRepository.mock.calls.map(
      ([request]) => (request as { generation: number }).generation,
    );
    expect(new Set(generations).size).toBe(2);
    first.unmount();
    second.unmount();
  });

  it("does not carry one repository's status over to the next", async () => {
    let release: () => void = () => undefined;
    const { result, rerender } = renderHook(
      ({ path }: { path: string }) => useLiveRepository(path),
      { wrapper, initialProps: { path: "/tmp/one" } },
    );
    await waitFor(() => {
      expect(result.current.status.kind).toBe("ready");
    });

    watchRepository.mockReturnValue(
      new Promise<null>((resolve) => {
        release = () => {
          resolve(null);
        };
      }),
    );
    rerender({ path: "/tmp/two" });

    expect(result.current.status.kind).toBe("starting");
    release();
    await waitFor(() => {
      expect(result.current.status.kind).toBe("ready");
    });
  });
});
