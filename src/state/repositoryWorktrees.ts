import { useQuery } from "@tanstack/react-query";

import { getRepositoryWorktrees } from "../lib/ipc";
import { queryKeys } from "./queryKeys";

/** Reads linked-worktree metadata only for the authorized active repository. */
export function useRepositoryWorktrees(path: string | null) {
  return useQuery({
    queryKey: queryKeys.repositoryWorktrees(path),
    queryFn: () => {
      if (path === null) throw new Error("No repository is open");
      return getRepositoryWorktrees(path);
    },
    enabled: path !== null,
    // This inventory belongs to the active repository context. A cached
    // inactive entry must be revalidated when its worktree becomes active;
    // the active watcher handles changes between activations, so this does
    // not poll inactive worktrees.
    staleTime: 0,
    gcTime: 5 * 60_000,
  });
}
