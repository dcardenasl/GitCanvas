import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import {
  onRepositoryChanged,
  unwatchRepository,
  watchRepository,
} from "../lib/ipc";
import { useWorktreeFingerprint } from "./worktree";

/** Queries that a change to refs, tags or branches can stale. */
const METADATA_QUERIES = ["history", "branches", "tags"] as const;

/** Queries that a change to the index or the working tree can stale. */
const WORKTREE_QUERIES = ["worktree", "worktree-file-diff"] as const;

/**
 * Query families that describe the repository as it is right now.
 *
 * A commit's own diff and contents are excluded deliberately: those really are
 * immutable once written, so discarding them on every change would re-read
 * work that cannot have changed.
 */
export const LIVE_QUERIES = [
  ...METADATA_QUERIES,
  ...WORKTREE_QUERIES,
  "worktree-fingerprint",
] as const;

/**
 * Keeps the open repository in step with what is on disk.
 *
 * The alternative — reading once and caching forever — showed the repository
 * as it was when it was opened, so a commit made anywhere else simply never
 * appeared. Watching the metadata directory is what makes the window a view of
 * the repository rather than a snapshot of it.
 */
export function useLiveRepository(path: string | null): {
  status: WatcherStatus;
  retry: () => void;
} {
  const queryClient = useQueryClient();
  const [retryToken, setRetryToken] = useState(0);
  // The outcome is stored with the repository it belongs to, so switching
  // repositories reads as "starting" again instead of inheriting the previous
  // repository's status while the new watch is still being set up.
  const [outcome, setOutcome] = useState<{
    readonly path: string;
    readonly status: WatcherStatus;
  } | null>(null);
  const status: WatcherStatus =
    path === null
      ? { kind: "idle" }
      : outcome?.path === path
        ? outcome.status
        : { kind: "starting" };
  const generationRef = useRef(0);
  const fingerprint = useWorktreeFingerprint(path, status.kind === "degraded");
  const previousFingerprint = useRef<{
    readonly path: string;
    readonly revision: string;
  } | null>(null);

  useEffect(() => {
    const revision = fingerprint.data?.revision;
    if (path === null || revision === undefined) return;

    // Compared only within one repository: a different repository always has a
    // different revision, and that is not a change worth reacting to.
    const previous = previousFingerprint.current;
    if (previous?.path === path && previous.revision !== revision) {
      for (const key of WORKTREE_QUERIES) {
        void queryClient.invalidateQueries({ queryKey: [key, path] });
      }
    }
    previousFingerprint.current = { path, revision };
  }, [fingerprint.data?.revision, path, queryClient]);

  useEffect(() => {
    if (path === null) {
      return;
    }

    let cancelled = false;
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    const invalidate = (scope: "metadata" | "worktree") => {
      const keys = scope === "metadata" ? METADATA_QUERIES : WORKTREE_QUERIES;
      for (const key of keys) {
        void queryClient.invalidateQueries({ queryKey: [key, path] });
      }
    };

    void watchRepository({ path, generation })
      .then(() => {
        if (!cancelled) setOutcome({ path, status: { kind: "ready" } });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setOutcome({
            path,
            status: {
              kind: "degraded",
              message:
                error instanceof Error
                  ? error.message
                  : "No se pudo iniciar el watcher",
            },
          });
        }
      });

    const listening = onRepositoryChanged(({ payload }) => {
      if (cancelled) return;
      if (payload.path !== path || payload.generation !== generation) return;
      if (payload.kind === "Metadata") {
        invalidate("metadata");
      } else if (payload.kind === "Worktree") {
        invalidate("worktree");
      } else {
        setOutcome({
          path,
          status: { kind: "degraded", message: payload.kind.Degraded.message },
        });
      }
    });

    return () => {
      cancelled = true;
      void listening.then((stop) => {
        stop();
      });
      void unwatchRepository(generation).catch(() => undefined);
    };
  }, [path, queryClient, retryToken]);

  useEffect(() => {
    if (status.kind !== "degraded") return;
    // The fingerprint poller keeps local changes fresh while degraded. Retry
    // installing the native watcher slowly so a persistent OS resource error
    // cannot turn into a request storm; the toolbar still offers an immediate
    // manual retry.
    const timer = setTimeout(() => {
      setRetryToken((token) => token + 1);
    }, 30_000);
    return () => {
      clearTimeout(timer);
    };
  }, [status.kind]);

  return {
    status,
    retry: () => {
      setRetryToken((token) => token + 1);
    },
  };
}

export type WatcherStatus =
  | { kind: "idle" }
  | { kind: "starting" }
  | { kind: "ready" }
  | { kind: "degraded"; message: string };
