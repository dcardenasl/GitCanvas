import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

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
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
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
