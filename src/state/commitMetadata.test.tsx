// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { CommitInfo } from "../bindings";
import { createQueryClientWrapper } from "../test/test-utils";
import { useCommitMetadata } from "./commitMetadata";

const getCommit = vi.hoisted(() =>
  vi.fn<(root: string, id: string) => Promise<CommitInfo>>(),
);
vi.mock("../lib/ipc", () => ({ getCommit }));
const commit: CommitInfo = {
  id: "a".repeat(40),
  summary: "remembered",
  message: "remembered",
  parents: [],
  author_name: "Test",
  author_email: "test@example.com",
  author_time: "1",
  commit_time: "1",
};
beforeEach(() => {
  getCommit.mockReset();
});

it("uses loaded metadata without another read", () => {
  const { result } = renderHook(
    () => useCommitMetadata("/repo", commit.id, commit),
    { wrapper: createQueryClientWrapper() },
  );
  expect(result.current.data).toBe(commit);
  expect(getCommit).not.toHaveBeenCalled();
});

it("does not read a remembered commit before the root is authorized", () => {
  renderHook(() => useCommitMetadata(null, commit.id, null), {
    wrapper: createQueryClientWrapper(),
  });
  expect(getCommit).not.toHaveBeenCalled();
});

it("loads metadata by id and isolates a late response after a project switch", async () => {
  let finish: ((value: CommitInfo) => void) | undefined;
  getCommit.mockImplementationOnce(
    () =>
      new Promise<CommitInfo>((resolve) => {
        finish = resolve;
      }),
  );
  const beta = { ...commit, summary: "beta" };
  getCommit.mockResolvedValue(beta);
  const hook = renderHook(
    ({ root }: { root: string }) => useCommitMetadata(root, commit.id, null),
    { initialProps: { root: "/alpha" }, wrapper: createQueryClientWrapper() },
  );
  hook.rerender({ root: "/beta" });
  await waitFor(() => {
    expect(hook.result.current.data).toEqual(beta);
  });
  finish?.(commit);
  await Promise.resolve();
  expect(hook.result.current.data).toEqual(beta);
  expect(getCommit).toHaveBeenCalledWith("/beta", commit.id);
});

it("keeps a missing object as a recoverable error and reads it again only on retry", async () => {
  getCommit
    .mockRejectedValueOnce(new Error("missing object"))
    .mockResolvedValue(commit);
  const hook = renderHook(() => useCommitMetadata("/repo", commit.id, null), {
    wrapper: createQueryClientWrapper(),
  });
  await waitFor(() => {
    expect(hook.result.current.isError).toBe(true);
  });
  expect(getCommit).toHaveBeenCalledTimes(1);
  await hook.result.current.refetch();
  await waitFor(() => {
    expect(hook.result.current.data).toEqual(commit);
  });
});
