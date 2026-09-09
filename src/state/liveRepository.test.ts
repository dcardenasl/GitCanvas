// @vitest-environment jsdom
import { QueryClient } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Handler = (event: { payload: { path: string } }) => void;

let handler: Handler | null = null;
const stop = vi.fn();
const watchRepository = vi.fn<(path: string) => Promise<null>>();
const unwatchRepository = vi.fn<() => Promise<null>>();

vi.mock("../lib/ipc", () => ({
  watchRepository: (path: string) => watchRepository(path),
  unwatchRepository: () => unwatchRepository(),
  onRepositoryChanged: (fn: Handler) => {
    handler = fn;
    return Promise.resolve(stop);
  },
}));

const { useLiveRepository } = await import("./liveRepository");

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client }, children);
}

beforeEach(() => {
  vi.clearAllMocks();
  handler = null;
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  watchRepository.mockResolvedValue(null);
  unwatchRepository.mockResolvedValue(null);
});
afterEach(() => {
  client.clear();
});

describe("useLiveRepository", () => {
  it("watches the repository that is open", () => {
    renderHook(
      () => {
        useLiveRepository("/tmp/repo");
      },
      { wrapper },
    );

    expect(watchRepository).toHaveBeenCalledWith("/tmp/repo");
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
    handler?.({ payload: { path: "/tmp/repo" } });

    const keys = invalidate.mock.calls.map((call) => call[0]?.queryKey?.[0]);
    expect(keys).toContain("history");
    expect(keys).toContain("branches");
    expect(keys).toContain("tags");
  });

  it("leaves a commit's own diff alone", async () => {
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
    handler?.({ payload: { path: "/tmp/repo" } });

    const keys = invalidate.mock.calls.map((call) => call[0]?.queryKey?.[0]);
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

    await Promise.resolve();
    unmount();

    // A watch that outlives its window keeps invalidating caches for a
    // repository nobody is looking at.
    expect(unwatchRepository).toHaveBeenCalled();
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
});
