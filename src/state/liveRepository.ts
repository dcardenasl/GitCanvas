import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import {
  onRepositoryChanged,
  unwatchRepository,
  watchRepository,
} from "../lib/ipc";

/**
 * Query families that describe the repository as it is right now.
 *
 * A commit's own diff and contents are excluded deliberately: those really are
 * immutable once written, so discarding them on every change would re-read
 * work that cannot have changed.
 */
const LIVE_QUERIES = ["history", "branches", "tags"] as const;

/**
 * Keeps the open repository in step with what is on disk.
 *
 * The alternative — reading once and caching forever — showed the repository
 * as it was when it was opened, so a commit made anywhere else simply never
 * appeared. Watching the metadata directory is what makes the window a view of
 * the repository rather than a snapshot of it.
 */
export function useLiveRepository(path: string | null): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (path === null) return;

    let cancelled = false;

    const started = watchRepository(path).catch(() => {
      // A watch can fail on a network volume or under a restrictive sandbox.
      // The manual refresh and the focus refetch still cover those cases, so
      // this degrades rather than breaking the window.
      return undefined;
    });

    const listening = onRepositoryChanged(() => {
      if (cancelled) return;
      for (const key of LIVE_QUERIES) {
        void queryClient.invalidateQueries({ queryKey: [key, path] });
      }
    });

    return () => {
      cancelled = true;
      void started;
      void listening.then((stop) => {
        stop();
      });
      void unwatchRepository().catch(() => undefined);
    };
  }, [path, queryClient]);
}

export { LIVE_QUERIES };
