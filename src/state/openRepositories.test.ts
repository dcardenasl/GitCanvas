// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const syncOpenRepositories = vi.hoisted(() => vi.fn());
vi.mock("../lib/ipc", () => ({ syncOpenRepositories }));

const { useOpenRepositoriesSync } = await import("./openRepositories");

beforeEach(() => {
  syncOpenRepositories.mockReset();
  syncOpenRepositories.mockResolvedValue(null);
});

describe("useOpenRepositoriesSync", () => {
  it("reports the complete set with an increasing revision", async () => {
    const { rerender } = renderHook(
      ({ paths }) => useOpenRepositoriesSync(paths),
      {
        initialProps: { paths: ["/a"] },
      },
    );
    await waitFor(() => {
      expect(syncOpenRepositories).toHaveBeenCalledTimes(1);
    });

    rerender({ paths: ["/a", "/b"] });
    await waitFor(() => {
      expect(syncOpenRepositories).toHaveBeenCalledTimes(2);
    });

    const [first, second] = syncOpenRepositories.mock.calls.map(
      ([request]) => request as { revision: number; paths: string[] },
    );
    expect(first?.paths).toEqual(["/a"]);
    expect(second?.paths).toEqual(["/a", "/b"]);
    expect(second?.revision).toBeGreaterThan(first?.revision ?? Infinity);
  });

  it("sends nothing for a new array holding the same paths", async () => {
    const { rerender } = renderHook(
      ({ paths }) => useOpenRepositoriesSync(paths),
      {
        initialProps: { paths: ["/a"] },
      },
    );
    await waitFor(() => {
      expect(syncOpenRepositories).toHaveBeenCalledTimes(1);
    });

    rerender({ paths: ["/a"] });
    rerender({ paths: ["/a"] });

    expect(syncOpenRepositories).toHaveBeenCalledTimes(1);
  });

  it("reports an empty set when the last repository closes", async () => {
    const { rerender } = renderHook(
      ({ paths }) => useOpenRepositoriesSync(paths),
      {
        initialProps: { paths: ["/a"] as string[] },
      },
    );
    await waitFor(() => {
      expect(syncOpenRepositories).toHaveBeenCalledTimes(1);
    });

    rerender({ paths: [] });

    await waitFor(() => {
      expect(syncOpenRepositories).toHaveBeenCalledTimes(2);
    });
    expect(syncOpenRepositories.mock.calls[1]?.[0]).toMatchObject({
      paths: [],
    });
  });

  it("surfaces a failure, does not repeat it alone, and retries on request", async () => {
    syncOpenRepositories.mockRejectedValueOnce(new Error("rejected"));
    const { result, rerender } = renderHook(() =>
      useOpenRepositoriesSync(["/a"]),
    );

    await waitFor(() => {
      expect(result.current.error).toBeInstanceOf(Error);
    });
    rerender();
    expect(syncOpenRepositories).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.retry();
    });

    await waitFor(() => {
      expect(result.current.error).toBeNull();
    });
    expect(syncOpenRepositories).toHaveBeenCalledTimes(2);
  });

  it("ignores the outcome of a report that is no longer the latest", async () => {
    let rejectFirst: (reason: Error) => void = () => undefined;
    syncOpenRepositories.mockReturnValueOnce(
      new Promise((_resolve, reject: (reason: Error) => void) => {
        rejectFirst = reject;
      }),
    );
    const { result, rerender } = renderHook(
      ({ paths }) => useOpenRepositoriesSync(paths),
      {
        initialProps: { paths: ["/a"] },
      },
    );
    rerender({ paths: ["/b"] });
    await waitFor(() => {
      expect(syncOpenRepositories).toHaveBeenCalledTimes(2);
    });

    await act(async () => {
      rejectFirst(new Error("old report failed"));
      await Promise.resolve();
    });

    expect(result.current.error).toBeNull();
  });
});
