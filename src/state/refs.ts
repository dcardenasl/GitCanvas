import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import type { BranchInfo, TagInfo } from "../bindings";
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
 * Branches of the open repository.
 *
 * The one place the branch query is defined: the sidebar, the row badges and
 * the toolbar all read it, so they share a cache entry and can never disagree
 * about which branch is checked out.
 */
export function useBranches(path: string | null) {
  return useQuery<BranchInfo[]>({
    queryKey: ["branches", path],
    enabled: path !== null,
    queryFn: () => {
      if (path === null) throw new Error("No repository is open");
      return getBranches(path);
    },
  });
}

/** Tags of the open repository. See {@link useBranches}. */
export function useTags(path: string | null) {
  return useQuery<TagInfo[]>({
    queryKey: ["tags", path],
    enabled: path !== null,
    queryFn: () => {
      if (path === null) throw new Error("No repository is open");
      return getTags(path);
    },
  });
}

/**
 * The checked-out local branch, or `null` while unknown or on a detached HEAD.
 *
 * Deliberately not derived from the repository's folder name: a folder says
 * nothing about which branch a push would send.
 */
export function useCurrentBranch(path: string | null): string | null {
  const branches = useBranches(path);
  const head = branches.data?.find(
    (branch) => branch.is_head && !branch.is_remote,
  );
  return head?.name ?? null;
}

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
  const branches = useBranches(path);
  const tags = useTags(path);

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
