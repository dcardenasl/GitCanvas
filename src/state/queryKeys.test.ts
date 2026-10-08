import type { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { createTestQueryClient } from "../test/test-utils";
import { invalidateLive, queryKeys } from "./queryKeys";

const PATH = "/repo";
const OTHER_PATH = "/other";
const SNAPSHOT_REQUEST = {
  staged_cursor: "next-staged",
  unstaged_cursor: "next-unstaged",
  limit: 50,
  expected_revision: "revision",
};
const FILE_DIFF_REQUEST = {
  side: "unstaged" as const,
  path: "src/main.ts",
  expected_revision: "revision",
  expand: false,
};

function makeClient(): QueryClient {
  return createTestQueryClient();
}

function seedLiveQueries(client: QueryClient): void {
  const keys = [
    queryKeys.history(PATH),
    queryKeys.branches(PATH),
    queryKeys.tags(PATH),
    queryKeys.worktree(PATH, SNAPSHOT_REQUEST),
    queryKeys.worktreeFileDiff(PATH, FILE_DIFF_REQUEST),
    queryKeys.worktreeFingerprint(PATH),
  ];
  for (const key of keys) client.setQueryData(key, { seeded: true });
}

describe("queryKeys and invalidateLive", () => {
  it("invalidates metadata queries without touching worktree or immutable data", async () => {
    const client = makeClient();
    seedLiveQueries(client);
    const immutableDiff = queryKeys.commitDiff(PATH, "commit", null, null);
    const otherRepository = queryKeys.history(OTHER_PATH);
    client.setQueryData(immutableDiff, { seeded: true });
    client.setQueryData(otherRepository, { seeded: true });

    await invalidateLive(client, PATH, "metadata");

    expect(client.getQueryState(queryKeys.history(PATH))?.isInvalidated).toBe(
      true,
    );
    expect(client.getQueryState(queryKeys.branches(PATH))?.isInvalidated).toBe(
      true,
    );
    expect(client.getQueryState(queryKeys.tags(PATH))?.isInvalidated).toBe(
      true,
    );
    expect(
      client.getQueryState(queryKeys.worktree(PATH, SNAPSHOT_REQUEST))
        ?.isInvalidated,
    ).toBe(false);
    expect(client.getQueryState(immutableDiff)?.isInvalidated).toBe(false);
    expect(client.getQueryState(otherRepository)?.isInvalidated).toBe(false);
    client.clear();
  });

  it("refreshes only the history tip page and leaves continuation to demand", async () => {
    const client = makeClient();
    const pages = [
      { number: 1, commits: [], next_cursor: "cursor-1", roots: ["root"] },
      { number: 2, commits: [], next_cursor: "cursor-2", roots: ["root"] },
      { number: 3, commits: [], next_cursor: null, roots: ["root"] },
    ];
    const pageParams = [
      { cursor: null, roots: null },
      { cursor: "cursor-1", roots: ["root"] },
      { cursor: "cursor-2", roots: ["root"] },
    ];
    client.setQueryData(queryKeys.history(PATH), { pages, pageParams });

    await invalidateLive(client, PATH, "metadata");

    expect(
      client.getQueryData<{
        pages: typeof pages;
        pageParams: typeof pageParams;
      }>(queryKeys.history(PATH)),
    ).toEqual({ pages: [pages[0]], pageParams: [pageParams[0]] });
    client.clear();
  });

  it("invalidates every live family for one repository while preserving scope", async () => {
    const client = makeClient();
    seedLiveQueries(client);
    const immutableDiff = queryKeys.commitDiff(PATH, "commit", null, null);
    client.setQueryData(immutableDiff, { seeded: true });

    await invalidateLive(client, PATH);

    for (const key of [
      queryKeys.history(PATH),
      queryKeys.branches(PATH),
      queryKeys.tags(PATH),
      queryKeys.worktree(PATH, SNAPSHOT_REQUEST),
      queryKeys.worktreeFileDiff(PATH, FILE_DIFF_REQUEST),
      queryKeys.worktreeFingerprint(PATH),
    ]) {
      expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    }
    expect(client.getQueryState(immutableDiff)?.isInvalidated).toBe(false);
    client.clear();
  });

  it("invalidates worktree reads without staling repository metadata", async () => {
    const client = makeClient();
    seedLiveQueries(client);

    await invalidateLive(client, PATH, "worktree");

    expect(client.getQueryState(queryKeys.history(PATH))?.isInvalidated).toBe(
      false,
    );
    expect(client.getQueryState(queryKeys.branches(PATH))?.isInvalidated).toBe(
      false,
    );
    expect(client.getQueryState(queryKeys.tags(PATH))?.isInvalidated).toBe(
      false,
    );
    expect(
      client.getQueryState(queryKeys.worktree(PATH, SNAPSHOT_REQUEST))
        ?.isInvalidated,
    ).toBe(true);
    expect(
      client.getQueryState(queryKeys.worktreeFileDiff(PATH, FILE_DIFF_REQUEST))
        ?.isInvalidated,
    ).toBe(true);
    expect(
      client.getQueryState(queryKeys.worktreeFingerprint(PATH))?.isInvalidated,
    ).toBe(true);
    client.clear();
  });
});
