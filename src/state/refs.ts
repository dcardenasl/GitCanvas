import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { getBranches, getTags } from "../lib/ipc";

/** A ref that can be shown as a badge on the commit it points at. */
export interface RefBadge {
  readonly name: string;
  readonly kind: "local" | "remote" | "tag";
  readonly isHead: boolean;
}

const EMPTY: readonly RefBadge[] = [];

/** Local first, then remotes, then tags; alphabetical within each. */
const ORDER: Record<RefBadge["kind"], number> = {
  local: 0,
  remote: 1,
  tag: 2,
};

/**
 * Refs grouped by the commit they point at.
 *
 * Built from the branch and tag queries the sidebar already runs, so showing
 * badges on rows costs no extra request: React Query serves both callers from
 * the same cache entries.
 */
export function useRefsByCommit(
  path: string | null,
): ReadonlyMap<string, readonly RefBadge[]> {
  const branches = useQuery({
    queryKey: ["branches", path],
    enabled: path !== null,
    queryFn: () => {
      if (path === null) throw new Error("No repository is open");
      return getBranches(path);
    },
  });

  const tags = useQuery({
    queryKey: ["tags", path],
    enabled: path !== null,
    queryFn: () => {
      if (path === null) throw new Error("No repository is open");
      return getTags(path);
    },
  });

  return useMemo(() => {
    const byCommit = new Map<string, RefBadge[]>();

    const add = (commitId: string | null, badge: RefBadge) => {
      if (commitId === null) return;
      const existing = byCommit.get(commitId);
      if (existing === undefined) byCommit.set(commitId, [badge]);
      else existing.push(badge);
    };

    for (const branch of branches.data ?? []) {
      add(branch.target, {
        name: branch.name,
        kind: branch.is_remote ? "remote" : "local",
        isHead: branch.is_head,
      });
    }

    for (const tag of tags.data ?? []) {
      // The resolved commit, not the tag object: an annotated tag points at a
      // tag object, which is never a row in the history.
      add(tag.commit_id, { name: tag.name, kind: "tag", isHead: false });
    }

    for (const badges of byCommit.values()) {
      badges.sort(
        (a, b) => ORDER[a.kind] - ORDER[b.kind] || a.name.localeCompare(b.name),
      );
    }

    return byCommit;
  }, [branches.data, tags.data]);
}

export { EMPTY as NO_REFS };
