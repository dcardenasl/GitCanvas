import { useQuery } from "@tanstack/react-query";
import type { CommitInfo } from "../bindings";
import { getCommit } from "../lib/ipc";
import { queryKeys } from "./queryKeys";

/** Resolves a selected commit outside the loaded walk without fetching hidden history pages. */
export function useCommitMetadata(
  root: string | null,
  id: string | null,
  loaded: CommitInfo | null,
) {
  const query = useQuery({
    queryKey: queryKeys.commit(root, id),
    enabled: root !== null && id !== null && loaded === null,
    queryFn: () => {
      if (root === null || id === null)
        throw new Error("No commit is selected");
      return getCommit(root, id);
    },
    staleTime: Infinity,
  });
  return { ...query, data: loaded ?? query.data };
}
