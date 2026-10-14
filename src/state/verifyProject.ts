import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { getWorktreeFingerprint, openRepository } from "../lib/ipc";
import { invalidateLive, queryKeys } from "./queryKeys";
import { branchesQuery, tagsQuery } from "./refs";
import { tabOf, useWorkspace } from "./workspace";

/** What the cached refs say, or `null` when nothing is cached to compare. */
function cachedRefs(queryClient: QueryClient, root: string): string | null {
  const branches = queryClient.getQueryData(queryKeys.branches(root));
  const tags = queryClient.getQueryData(queryKeys.tags(root));
  return branches === undefined || tags === undefined
    ? null
    : JSON.stringify([branches, tags]);
}

/**
 * Checks that the project with `root` is still what the interface holds.
 *
 * Opening it again confirms it is still a repository at that very root, and
 * authorizes it: a project restored from the last run was never opened in this
 * one. Its refs are read afresh and compared with the cached ones — a cache
 * that still matches is kept, including every page of history already loaded,
 * and one that no longer matches is discarded. The working tree is always read
 * again, because editors change it without touching Git's own files.
 *
 * Until it finishes the project is marked as being verified, and writes to it
 * stay disabled; if it fails, the project is marked unreachable with the cause.
 * A check already in progress for the project is not started twice.
 */
export async function verifyProject(
  root: string,
  queryClient: QueryClient,
): Promise<void> {
  const store = useWorkspace.getState();
  const tab = tabOf(store, root);
  if (tab === null || tab.verification.status === "verifying") return;
  const attempt = { status: "verifying" as const };
  const current = () =>
    tabOf(useWorkspace.getState(), root)?.verification === attempt;
  store.setVerification(root, attempt);

  try {
    const info = await openRepository(root);
    if (info.path !== root) {
      throw new Error(`The project at ${root} now resolves to ${info.path}`);
    }

    if (!current()) return;
    const before = cachedRefs(queryClient, root);
    const [branches, tags, fingerprint] = await Promise.all([
      queryClient.query({ ...branchesQuery(root), staleTime: 0 }),
      queryClient.query({ ...tagsQuery(root), staleTime: 0 }),
      getWorktreeFingerprint(root),
    ]);
    if (!current()) return;
    if (before !== null && before !== JSON.stringify([branches, tags])) {
      await invalidateLive(queryClient, root, "metadata");
    }
    queryClient.setQueryData(queryKeys.worktreeFingerprint(root), fingerprint);
    await invalidateLive(queryClient, root, "worktree");
    if (current())
      useWorkspace.getState().setVerification(root, { status: "verified" });
  } catch (error) {
    if (!current()) return;
    useWorkspace
      .getState()
      .setVerification(root, { status: "unreachable", error });
  }
}

/** What the shell needs to show about the active project's check. */
export interface ActiveVerification {
  /** Why the active project could not be verified, or `null`. */
  readonly error: unknown;
  /** Checks it again. */
  readonly retry: () => void;
}

/**
 * Verifies each project as it becomes the active one.
 *
 * Every activation, not only the first: a project left in the background may
 * have changed under it.
 */
export function useVerifyActiveProject(): ActiveVerification {
  const queryClient = useQueryClient();
  const root = useWorkspace((state) => state.activeRoot);
  const verification = useWorkspace((state) =>
    state.activeRoot === null
      ? null
      : (tabOf(state, state.activeRoot)?.verification ?? null),
  );

  const needsVerification = verification?.status === "unverified";
  useEffect(() => {
    if (root !== null) void verifyProject(root, queryClient);
  }, [root, queryClient, needsVerification]);

  return {
    error: verification?.status === "unreachable" ? verification.error : null,
    retry: () => {
      if (root !== null) void verifyProject(root, queryClient);
    },
  };
}
