import type {
  InfiniteData,
  QueryClient,
  QueryKey,
} from "@tanstack/react-query";

import type {
  HistoryPage,
  WorktreeFileDiffRequest,
  WorktreeSnapshotRequest,
} from "../bindings";

/** Canonical cache identities for every React Query resource in the app. */
export const queryKeys = {
  history: (repositoryPath: string | null, roots?: readonly string[]) =>
    roots === undefined
      ? (["history", repositoryPath] as const)
      : (["history", repositoryPath, roots] as const),
  commit: (repositoryPath: string | null, commitId: string | null) =>
    ["commit", repositoryPath, commitId] as const,
  refs: (repositoryPath: string | null) => ["refs", repositoryPath] as const,
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
  workspaceLimits: () => ["workspace", "limits"] as const,
  github: () => ["github"] as const,
  githubToken: () => ["github", "token"] as const,
  githubRepositories: () => ["github", "repositories"] as const,
};

type LiveQueryScope = "metadata" | "worktree" | "all";

function liveKeys(repositoryPath: string, scope: LiveQueryScope): QueryKey[] {
  const metadata: QueryKey[] = [
    queryKeys.history(repositoryPath),
    queryKeys.refs(repositoryPath),
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
  if (scope !== "worktree") {
    const historyKey = queryKeys.history(repositoryPath);
    for (const [key, history] of queryClient.getQueriesData<
      InfiniteData<HistoryPage>
    >({ queryKey: historyKey })) {
      const [firstPage] = history?.pages ?? [];
      const [firstPageParam] = history?.pageParams ?? [];
      if (
        history !== undefined &&
        firstPage !== undefined &&
        firstPageParam !== undefined
      ) {
        queryClient.setQueryData<InfiniteData<HistoryPage>>(key, {
          ...history,
          pages: [firstPage],
          pageParams: [firstPageParam],
        });
      }
    }
  }

  return Promise.all(
    liveKeys(repositoryPath, scope).map((queryKey) =>
      queryClient.invalidateQueries({ queryKey }),
    ),
  ).then(() => undefined);
}

/** Releases every cache entry owned by a closed project, including in-flight queries. */
export function removeProjectQueries(
  queryClient: QueryClient,
  root: string,
): void {
  queryClient.removeQueries({
    predicate: (query) => query.queryKey[1] === root,
  });
}

/** Releases bounded-but-heavy data while keeping small reference summaries available. */
export function removeHeavyProjectQueries(
  queryClient: QueryClient,
  root: string,
): void {
  const light = new Set<string>([
    queryKeys.refs(root)[0],
    queryKeys.worktreeFingerprint(root)[0],
  ]);
  queryClient.removeQueries({
    predicate: (query) =>
      query.queryKey[1] === root &&
      !(typeof query.queryKey[0] === "string" && light.has(query.queryKey[0])),
  });
}
