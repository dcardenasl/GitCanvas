import { expect, it } from "vitest";
import { createTestQueryClient } from "../test/test-utils";
import { ProjectCache } from "./projectCache";
import { queryKeys } from "./queryKeys";

it("keeps exactly five inactive heavy caches and never evicts the active root", () => {
  const client = createTestQueryClient();
  const cache = new ProjectCache();
  const roots = Array.from({ length: 8 }, (_, i) => `/repo/${String(i)}`);
  for (let i = 0; i < roots.length; i += 1) {
    const root = roots[i];
    if (root === undefined) throw new Error("Missing root");
    client.setQueryData(queryKeys.history(root), { marker: i });
    cache.retain(client, roots.slice(0, i + 1), root);
  }
  expect(client.getQueryData(queryKeys.history("/repo/0"))).toBeUndefined();
  expect(client.getQueryData(queryKeys.history("/repo/1"))).toBeUndefined();
  for (const root of roots.slice(2))
    expect(client.getQueryData(queryKeys.history(root))).toBeDefined();
  cache.retain(client, roots, "/repo/0");
  client.setQueryData(queryKeys.history("/repo/0"), { reloaded: true });
  expect(client.getQueryData(queryKeys.history("/repo/2"))).toBeUndefined();
  expect(client.getQueryData(queryKeys.history("/repo/0"))).toEqual({
    reloaded: true,
  });
});

it("closing removes every resource of that root without touching another project or global data", () => {
  const client = createTestQueryClient();
  const cache = new ProjectCache();
  const root = "/repo/a";
  const keys = [
    queryKeys.history(root),
    queryKeys.commit(root, "id"),
    queryKeys.branches(root),
    queryKeys.tags(root),
    queryKeys.worktree(root),
    queryKeys.worktreeFileDiff(root),
    queryKeys.worktreeFingerprint(root),
    queryKeys.commitDiff(root, null, null, null),
    queryKeys.commitTree(root, "id", null),
    queryKeys.file(
      root,
      { kind: "commit", commitId: "id" },
      "file",
      false,
      undefined,
    ),
    queryKeys.file(
      root,
      { kind: "worktree", side: "staged" },
      "file",
      false,
      "revision",
    ),
  ];
  for (const key of keys) client.setQueryData(key, { marker: true });
  client.setQueryData(queryKeys.history("/repo/b"), { keep: true });
  client.setQueryData(queryKeys.workspaceLimits(), { keep: true });
  cache.retain(client, [root, "/repo/b"], root);
  cache.retain(client, ["/repo/b"], "/repo/b");
  for (const key of keys) expect(client.getQueryData(key)).toBeUndefined();
  expect(client.getQueryData(queryKeys.history("/repo/b"))).toEqual({
    keep: true,
  });
  expect(client.getQueryData(queryKeys.workspaceLimits())).toEqual({
    keep: true,
  });
});

it("LRU eviction retains the small refs and fingerprint but closing removes those too", () => {
  const client = createTestQueryClient();
  const cache = new ProjectCache();
  const root = "/repo/old";
  const light = [
    queryKeys.branches(root),
    queryKeys.tags(root),
    queryKeys.worktreeFingerprint(root),
  ];
  for (const key of light) client.setQueryData(key, { known: true });
  client.setQueryData(queryKeys.worktree(root), { heavy: true });
  cache.retain(client, [root], root);
  const roots = [root];
  for (let i = 0; i < 6; i += 1) {
    const next = `/repo/${String(i)}`;
    roots.push(next);
    cache.retain(client, roots, next);
  }
  expect(client.getQueryData(queryKeys.worktree(root))).toBeUndefined();
  for (const key of light)
    expect(client.getQueryData(key)).toEqual({ known: true });
  cache.retain(client, roots.slice(1), "/repo/5");
  for (const key of light) expect(client.getQueryData(key)).toBeUndefined();
});
