import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { removeHeavyProjectQueries, removeProjectQueries } from "./queryKeys";
import { useWorkspace } from "./workspace";

const MAX_INACTIVE = 5;

/** A workspace's activation history controls retention independently of query gcTime. */
export class ProjectCache {
  private open = new Set<string>();
  private recent: string[] = [];

  /** Releases closed roots and keeps heavy data for the active root and five recent others. */
  retain(
    client: QueryClient,
    roots: readonly string[],
    active: string | null,
  ): void {
    const open = new Set(roots);
    for (const root of this.open) {
      if (!open.has(root)) removeProjectQueries(client, root);
    }
    this.recent = this.recent.filter(
      (root) => open.has(root) && root !== active,
    );
    for (const root of roots) {
      if (root !== active && !this.recent.includes(root))
        this.recent.push(root);
    }
    if (active !== null && open.has(active)) this.recent.unshift(active);
    const retained = new Set(
      this.recent.slice(0, active === null ? MAX_INACTIVE : MAX_INACTIVE + 1),
    );
    for (const root of open) {
      if (!retained.has(root) && root !== active)
        removeHeavyProjectQueries(client, root);
    }
    this.open = open;
  }
}

/** Runs after the view switched so closing releases the previous view's cache observers. */
export function useProjectCache(): void {
  const client = useQueryClient();
  const roots = useWorkspace(
    useShallow((state) => state.tabs.map((tab) => tab.repository.path)),
  );
  const active = useWorkspace((state) => state.activeRoot);
  const cache = useRef<ProjectCache | null>(null);
  useEffect(() => {
    cache.current ??= new ProjectCache();
    cache.current.retain(client, roots, active);
  }, [client, roots, active]);
}
