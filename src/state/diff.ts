import { useQuery } from "@tanstack/react-query";

import type { CommitDiff } from "../bindings";
import { getCommitDiff } from "../lib/ipc";
import { queryKeys } from "./queryKeys";

/**
 * One commit's diff, shared by every view that needs it.
 *
 * The file list and the file being read are different components in different
 * panels, and both need the same payload. Going through one hook means React
 * Query serves them from a single cache entry instead of issuing the same
 * request twice, and it means the two can never disagree about what changed.
 */
export function useCommitDiff(
  repositoryPath: string | null,
  commitId: string | null,
  expandPath: string | null = null,
  filePath: string | null = null,
) {
  return useQuery<CommitDiff>({
    queryKey: queryKeys.commitDiff(
      repositoryPath,
      commitId,
      filePath,
      expandPath,
    ),
    enabled: repositoryPath !== null && commitId !== null,
    queryFn: () => {
      if (repositoryPath === null || commitId === null) {
        throw new Error("No commit is selected");
      }
      return getCommitDiff(repositoryPath, {
        commit_id: commitId,
        file_path: filePath,
        expand_path: expandPath,
      });
    },
    // A commit's diff is immutable, so it never needs refetching.
    staleTime: Infinity,
  });
}
