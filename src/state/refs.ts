import { queryOptions, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import type { GraphColor, RepositoryRefsSnapshot } from "../bindings";
import { getRepositoryRefs } from "../lib/ipc";
import { useWorkspace } from "./workspace";
import { queryKeys } from "./queryKeys";
import { useRepositoryWorktrees } from "./repositoryWorktrees";

/** A ref that can be shown as a badge on the commit it points at. */
export interface RefBadge {
  readonly name: string;
  readonly kind: "local" | "remote" | "tag";
  readonly isHead: boolean;
  readonly color?: GraphColor;
}

/** Local first, then remotes, then tags; alphabetical within each. */
const ORDER: Record<RefBadge["kind"], number> = {
  local: 0,
  remote: 1,
  tag: 2,
};

/** A shared generation for every reference consumer. */
export function refsQuery(path: string | null) {
  return queryOptions<RepositoryRefsSnapshot>({
    queryKey: queryKeys.refs(path),
    staleTime: 30_000,
    queryFn: () => {
      if (path === null) throw new Error("No repository is open");
      return getRepositoryRefs(path);
    },
  });
}

/** Observes references only for the supplied active project. */
export function useRepositoryRefs(path: string | null) {
  return useQuery({ ...refsQuery(path), enabled: path !== null });
}

/** Branch projection of the shared reference generation. */
export function useBranches(path: string | null) {
  return useQuery({
    ...refsQuery(path),
    enabled: path !== null,
    select: (data) => data.branches,
  });
}

/** Tag projection of the shared reference generation. */
export function useTags(path: string | null) {
  return useQuery({
    ...refsQuery(path),
    enabled: path !== null,
    select: (data) => data.tags,
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
  const worktrees = useRepositoryWorktrees(path);
  const saved = useWorkspace(
    (state) =>
      state.graphPreferences.find(
        (p) =>
          p.scope === "repository" && p.path === worktrees.data?.repository_id,
      ) ??
      state.graphPreferences.find(
        (p) => p.scope === "worktree" && p.path === path,
      ),
  );

  return useMemo(() => {
    const colors = new Map(
      saved?.colors.map((record) => [record.reference, record.color]),
    );
    const byCommit = new Map<string, RefBadge[]>();

    const add = (commitId: string | null, badge: RefBadge) => {
      if (commitId === null) return;
      const existing = byCommit.get(commitId);
      if (existing === undefined) byCommit.set(commitId, [badge]);
      else existing.push(badge);
    };

    for (const branch of branches.data ?? []) {
      if (branch.is_symbolic) continue;
      add(branch.target, {
        name: branch.name,
        kind: branch.is_remote ? "remote" : "local",
        isHead: branch.is_head,
        color: colors.get(branch.full_name) ?? "stone",
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
  }, [branches.data, tags.data, saved]);
}
