import type { QueryClient, QueryKey } from "@tanstack/react-query";

import type {
  WorktreeFileDiffRequest,
  WorktreeSnapshotRequest,
} from "../bindings";

/** Canonical cache identities for every React Query resource in the app. */
export const queryKeys = {
  history: (repositoryPath: string | null) =>
    ["history", repositoryPath] as const,
  branches: (repositoryPath: string | null) =>
    ["branches", repositoryPath] as const,
  tags: (repositoryPath: string | null) => ["tags", repositoryPath] as const,
  worktree: (
    repositoryPath: string | null,
    request?: WorktreeSnapshotRequest,
  ) =>
    request === undefined
      ? (["worktree", repositoryPath] as const)
      : (["worktree", repositoryPath, request] as const),
  worktreeFileDiff: (
    repositoryPath: string | null,
    request?: WorktreeFileDiffRequest | null,
  ) =>
    request === undefined
      ? (["worktree-file-diff", repositoryPath] as const)
      : (["worktree-file-diff", repositoryPath, request] as const),
  worktreeFingerprint: (repositoryPath: string | null) =>
    ["worktree-fingerprint", repositoryPath] as const,
  commitDiff: (
    repositoryPath: string | null,
    commitId: string | null,
    filePath: string | null,
    expandPath: string | null,
  ) => ["diff", repositoryPath, commitId, filePath, expandPath] as const,
  file: (
    repositoryPath: string,
    source:
      | { readonly kind: "commit"; readonly commitId: string }
      | { readonly kind: "worktree"; readonly side: "staged" | "unstaged" },
    filePath: string,
    expanded: boolean,
    localRevision: string | undefined,
  ) =>
    [
      source.kind === "worktree" ? "worktree-file" : "file",
      repositoryPath,
      source.kind === "worktree" ? source.side : source.commitId,
      filePath,
      expanded,
      localRevision,
    ] as const,
  commitTree: (
    repositoryPath: string,
    commitId: string,
    directoryPath: string | null,
  ) => ["commit-tree", repositoryPath, commitId, directoryPath] as const,
  github: () => ["github"] as const,
  githubToken: () => ["github", "token"] as const,
  githubRepositories: () => ["github", "repositories"] as const,
};

type LiveQueryScope = "metadata" | "worktree" | "all";

function liveKeys(repositoryPath: string, scope: LiveQueryScope): QueryKey[] {
  const metadata: QueryKey[] = [
    queryKeys.history(repositoryPath),
    queryKeys.branches(repositoryPath),
    queryKeys.tags(repositoryPath),
  ];
  const worktree: QueryKey[] = [
    queryKeys.worktree(repositoryPath),
    queryKeys.worktreeFileDiff(repositoryPath),
    queryKeys.worktreeFingerprint(repositoryPath),
  ];

  switch (scope) {
    case "metadata":
      return metadata;
    case "worktree":
      return worktree;
    case "all":
      return [...metadata, ...worktree];
  }
}

/** Invalidate live data for one repository, optionally limited to one change scope. */
export function invalidateLive(
  queryClient: QueryClient,
  repositoryPath: string,
  scope: LiveQueryScope = "all",
): Promise<void> {
  return Promise.all(
    liveKeys(repositoryPath, scope).map((queryKey) =>
      queryClient.invalidateQueries({ queryKey }),
    ),
  ).then(() => undefined);
}
