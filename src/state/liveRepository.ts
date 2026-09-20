import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import {
  onRepositoryChanged,
  unwatchRepository,
  watchRepository,
} from "../lib/ipc";
import { useWorktreeFingerprint } from "./worktree";

/**
 * Query families that describe the repository as it is right now.
 *
 * A commit's own diff and contents are excluded deliberately: those really are
 * immutable once written, so discarding them on every change would re-read
 * work that cannot have changed.
 */
const LIVE_QUERIES = [
  "history",
  "branches",
  "tags",
  "worktree",
  "worktree-file-diff",
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
  const [status, setStatus] = useState<WatcherStatus>(() =>
    path === null ? { kind: "idle" } : { kind: "ready" },
  );
  const generationRef = useRef(0);
  const fingerprint = useWorktreeFingerprint(path, status.kind === "degraded");
  const previousFingerprint = useRef<string | null>(null);

  useEffect(() => {
    const current = fingerprint.data?.revision ?? null;
    if (
      current !== null &&
      previousFingerprint.current !== null &&
      current !== previousFingerprint.current
    ) {
      void queryClient.invalidateQueries({ queryKey: ["worktree", path] });
      void queryClient.invalidateQueries({
        queryKey: ["worktree-file-diff", path],
      });
    }
    previousFingerprint.current = current;
  }, [fingerprint.data?.revision, path, queryClient]);

  useEffect(() => {
    if (path === null) {
      return;
    }

    let cancelled = false;
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    const invalidate = (scope: "metadata" | "worktree") => {
      const keys =
        scope === "metadata"
          ? ["history", "branches", "tags"]
          : ["worktree", "worktree-file-diff"];
      for (const key of keys) {
        void queryClient.invalidateQueries({ queryKey: [key, path] });
      }
    };

    const started = watchRepository({ path, generation })
      .then(() => {
        if (!cancelled) setStatus({ kind: "ready" });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setStatus({
            kind: "degraded",
            message:
              error instanceof Error
                ? error.message
                : "No se pudo iniciar el watcher",
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
        setStatus({ kind: "degraded", message: payload.kind.Degraded.message });
      }
    });

    return () => {
      cancelled = true;
      void started;
      void listening.then((stop) => {
        stop();
      });
      void unwatchRepository(generation).catch(() => undefined);
    };
  }, [path, queryClient, retryToken]);

  useEffect(() => {
    if (status.kind !== "degraded") return;
    const timer = setInterval(() => {
      setRetryToken((token) => token + 1);
    }, 3_000);
    return () => {
      clearInterval(timer);
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

export { LIVE_QUERIES };
