// @vitest-environment jsdom
import type { InfiniteData } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BranchInfo, HistoryPage } from "../bindings";
import {
  createQueryClientWrapper,
  createTestQueryClient,
} from "../test/test-utils";
import { openTestProject, resetWorkspace } from "../test/workspace";

const mockIpc = vi.hoisted(() => ({
  openRepository: vi.fn(),
  getBranches: vi.fn(),
  getTags: vi.fn(),
  getWorktreeFingerprint: vi.fn(),
}));
vi.mock("../lib/ipc", () => mockIpc);

const { verifyProject, useVerifyActiveProject } =
  await import("./verifyProject");
const { queryKeys } = await import("./queryKeys");
const { useWorkspace, tabOf } = await import("./workspace");
const { UNVERIFIED } = await import("./verification");

const ALPHA = { path: "/projects/alpha", name: "alpha" };
const BETA = { path: "/projects/beta", name: "beta" };

function branch(name: string, tip: string): BranchInfo {
  return {
    name,
    full_name: `refs/heads/${name}`,
    target: tip,
    is_remote: false,
    is_head: true,
    is_symbolic: false,
  };
}

const MAIN = [branch("main", "a".repeat(40))];
const MOVED = [branch("main", "b".repeat(40))];

function page(): InfiniteData<HistoryPage> {
  const first: HistoryPage = { commits: [], next_cursor: "c1", roots: [] };
  const second: HistoryPage = { commits: [], next_cursor: null, roots: [] };
  return { pages: [first, second], pageParams: [null, "c1"] };
}

function status(root: string): string | undefined {
  return tabOf(useWorkspace.getState(), root)?.verification.status;
}

beforeEach(() => {
  vi.clearAllMocks();
  resetWorkspace();
  mockIpc.openRepository.mockImplementation((path: string) =>
    Promise.resolve({ path, name: "project" }),
  );
  mockIpc.getBranches.mockResolvedValue(MAIN);
  mockIpc.getTags.mockResolvedValue([]);
  mockIpc.getWorktreeFingerprint.mockResolvedValue({ revision: "local" });
});

describe("verifyProject", () => {
  it("opens the project again, reads its refs and ends verified", async () => {
    const client = createTestQueryClient();
    openTestProject(ALPHA);
    useWorkspace.getState().setVerification(ALPHA.path, UNVERIFIED);

    const done = verifyProject(ALPHA.path, client);
    expect(status(ALPHA.path)).toBe("verifying");
    await done;

    expect(mockIpc.openRepository).toHaveBeenCalledWith(ALPHA.path);
    expect(mockIpc.getBranches).toHaveBeenCalledWith(ALPHA.path);
    expect(mockIpc.getTags).toHaveBeenCalledWith(ALPHA.path);
    expect(status(ALPHA.path)).toBe("verified");
  });

  it("keeps every cached history page when the refs have not moved", async () => {
    const client = createTestQueryClient();
    openTestProject(ALPHA);
    client.setQueryData(queryKeys.history(ALPHA.path), page());
    client.setQueryData(queryKeys.branches(ALPHA.path), MAIN);
    client.setQueryData(queryKeys.tags(ALPHA.path), []);

    await verifyProject(ALPHA.path, client);

    const history = client.getQueryState(queryKeys.history(ALPHA.path));
    expect(history?.isInvalidated).toBe(false);
    expect(
      client.getQueryData<InfiniteData<HistoryPage>>(
        queryKeys.history(ALPHA.path),
      )?.pages,
    ).toHaveLength(2);
  });

  it("discards the cached history when the refs have moved", async () => {
    const client = createTestQueryClient();
    openTestProject(ALPHA);
    client.setQueryData(queryKeys.history(ALPHA.path), page());
    client.setQueryData(queryKeys.branches(ALPHA.path), MAIN);
    client.setQueryData(queryKeys.tags(ALPHA.path), []);
    mockIpc.getBranches.mockResolvedValue(MOVED);

    await verifyProject(ALPHA.path, client);

    expect(
      client.getQueryState(queryKeys.history(ALPHA.path))?.isInvalidated,
    ).toBe(true);
    expect(
      client.getQueryData<InfiniteData<HistoryPage>>(
        queryKeys.history(ALPHA.path),
      )?.pages,
    ).toHaveLength(1);
  });

  it("does not invalidate history it has no refs to compare against", async () => {
    const client = createTestQueryClient();
    openTestProject(ALPHA);
    client.setQueryData(queryKeys.history(ALPHA.path), page());

    await verifyProject(ALPHA.path, client);

    expect(
      client.getQueryState(queryKeys.history(ALPHA.path))?.isInvalidated,
    ).toBe(false);
  });

  it("always reads the working tree again", async () => {
    const client = createTestQueryClient();
    openTestProject(ALPHA);
    client.setQueryData(queryKeys.worktree(ALPHA.path), { revision: "old" });
    client.setQueryData(queryKeys.branches(ALPHA.path), MAIN);
    client.setQueryData(queryKeys.tags(ALPHA.path), []);

    await verifyProject(ALPHA.path, client);

    expect(
      client.getQueryState(queryKeys.worktree(ALPHA.path))?.isInvalidated,
    ).toBe(true);
  });

  it("leaves another project's cache alone", async () => {
    const client = createTestQueryClient();
    openTestProject(ALPHA);
    openTestProject(BETA);
    client.setQueryData(queryKeys.worktree(BETA.path), { revision: "beta" });
    client.setQueryData(queryKeys.branches(ALPHA.path), MAIN);
    client.setQueryData(queryKeys.tags(ALPHA.path), []);
    mockIpc.getBranches.mockResolvedValue(MOVED);

    await verifyProject(ALPHA.path, client);

    expect(
      client.getQueryState(queryKeys.worktree(BETA.path))?.isInvalidated,
    ).toBe(false);
  });

  it("marks the project unreachable, with the cause, when it can no longer be opened", async () => {
    const client = createTestQueryClient();
    openTestProject(ALPHA);
    mockIpc.openRepository.mockRejectedValue(new Error("folder is gone"));

    await verifyProject(ALPHA.path, client);

    const verification = tabOf(
      useWorkspace.getState(),
      ALPHA.path,
    )?.verification;
    expect(verification).toMatchObject({ status: "unreachable" });
    expect(String((verification as { error: unknown }).error)).toContain(
      "folder is gone",
    );
    expect(mockIpc.getBranches).not.toHaveBeenCalled();
  });

  it("marks the project unreachable when its path now resolves elsewhere", async () => {
    const client = createTestQueryClient();
    openTestProject(ALPHA);
    mockIpc.openRepository.mockResolvedValue({
      path: "/somewhere/else",
      name: "else",
    });

    await verifyProject(ALPHA.path, client);

    expect(status(ALPHA.path)).toBe("unreachable");
  });

  it("can be tried again after it failed", async () => {
    const client = createTestQueryClient();
    openTestProject(ALPHA);
    mockIpc.getBranches.mockRejectedValueOnce(new Error("busy"));
    await verifyProject(ALPHA.path, client);
    expect(status(ALPHA.path)).toBe("unreachable");

    await verifyProject(ALPHA.path, client);

    expect(status(ALPHA.path)).toBe("verified");
  });

  it("does not start a second check while one is running", async () => {
    const client = createTestQueryClient();
    openTestProject(ALPHA);
    let release: (value: { path: string; name: string }) => void = () =>
      undefined;
    mockIpc.openRepository.mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve;
      }),
    );

    const first = verifyProject(ALPHA.path, client);
    await verifyProject(ALPHA.path, client);
    expect(mockIpc.openRepository).toHaveBeenCalledTimes(1);

    release({ path: ALPHA.path, name: "alpha" });
    await first;
    expect(status(ALPHA.path)).toBe("verified");
  });

  it("does nothing for a project that is not open", async () => {
    await verifyProject("/projects/never-opened", createTestQueryClient());

    expect(mockIpc.openRepository).not.toHaveBeenCalled();
  });
});

describe("useVerifyActiveProject", () => {
  it("checks a project each time it becomes the active one", async () => {
    openTestProject(ALPHA);
    openTestProject(BETA);
    const { rerender } = renderHook(() => useVerifyActiveProject(), {
      wrapper: createQueryClientWrapper(),
    });
    await waitFor(() => {
      expect(mockIpc.openRepository).toHaveBeenCalledWith(BETA.path);
    });

    act(() => {
      useWorkspace.getState().activate(ALPHA.path);
    });
    rerender();
    await waitFor(() => {
      expect(mockIpc.openRepository).toHaveBeenCalledWith(ALPHA.path);
    });

    act(() => {
      useWorkspace.getState().activate(BETA.path);
    });
    await waitFor(() => {
      expect(
        mockIpc.openRepository.mock.calls.filter(
          ([path]) => path === BETA.path,
        ),
      ).toHaveLength(2);
    });
  });

  it("offers the failure and a retry for the active project", async () => {
    openTestProject(ALPHA);
    mockIpc.openRepository.mockRejectedValueOnce(new Error("folder is gone"));
    const { result } = renderHook(() => useVerifyActiveProject(), {
      wrapper: createQueryClientWrapper(),
    });
    await waitFor(() => {
      expect(result.current.error).toBeInstanceOf(Error);
    });

    act(() => {
      result.current.retry();
    });

    await waitFor(() => {
      expect(result.current.error).toBeNull();
    });
  });

  it("has nothing to check or show when no project is open", () => {
    const { result } = renderHook(() => useVerifyActiveProject(), {
      wrapper: createQueryClientWrapper(),
    });

    result.current.retry();

    expect(result.current.error).toBeNull();
    expect(mockIpc.openRepository).not.toHaveBeenCalled();
  });
});

it("does not enable writes until the explicit working-tree fingerprint has arrived", async () => {
  let finish: ((value: { revision: string }) => void) | undefined;
  mockIpc.getWorktreeFingerprint.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const client = createTestQueryClient();
  openTestProject(ALPHA);
  const done = verifyProject(ALPHA.path, client);
  await waitFor(() => {
    expect(mockIpc.getWorktreeFingerprint).toHaveBeenCalledWith(ALPHA.path);
  });
  expect(status(ALPHA.path)).toBe("verifying");
  finish?.({ revision: "checked" });
  await done;
  expect(status(ALPHA.path)).toBe("verified");
  expect(
    client.getQueryData(queryKeys.worktreeFingerprint(ALPHA.path)),
  ).toEqual({ revision: "checked" });
});
