import { useEffect, useRef, useState } from "react";

import { syncOpenRepositories } from "../lib/ipc";

/** The backend reads the revision as an unsigned 32-bit integer. */
const MAX_REVISION = 0xffff_ffff;

// Module-level, like the watcher generations: every hook instance and every
// StrictMode remount draws from one sequence, so a request is never numbered
// below one the backend already applied.
let revisionSequence = 0;

function nextRevision(): number {
  revisionSequence += 1;
  if (revisionSequence > MAX_REVISION) {
    throw new Error("Open repositories revision limit reached");
  }
  return revisionSequence;
}

/** The report's outcome: whether the backend has the current set. */
export interface OpenRepositoriesSync {
  /** The failure of the latest report, or `null` when it was applied. */
  readonly error: unknown;
  /** Sends the current set again after a failure. */
  readonly retry: () => void;
}

/**
 * Tells the backend which repositories are open, so the clone cache never
 * evicts one a tab is using.
 *
 * The complete set is sent whenever it changes in value, never an "opened" or
 * "closed" delta, and the backend ignores a report older than one it already
 * applied. A new array with the same paths sends nothing. A failed report is
 * not repeated on its own — repeating a request that was rejected cannot change
 * the answer — and is surfaced for the caller to show and retry.
 */
export function useOpenRepositoriesSync(
  paths: readonly string[],
): OpenRepositoriesSync {
  const [failure, setFailure] = useState<{ readonly error: unknown } | null>(
    null,
  );
  const [retryToken, setRetryToken] = useState(0);
  const sent = useRef<{ key: string; token: number } | null>(null);
  const latest = useRef(0);

  useEffect(() => {
    const key = JSON.stringify(paths);
    if (sent.current?.key === key && sent.current.token === retryToken) return;
    sent.current = { key, token: retryToken };

    const revision = nextRevision();
    latest.current = revision;
    void syncOpenRepositories({ revision, paths: [...paths] }).then(
      () => {
        if (latest.current === revision) setFailure(null);
      },
      (error: unknown) => {
        if (latest.current === revision) setFailure({ error });
      },
    );
  }, [paths, retryToken]);

  return {
    error: failure === null ? null : failure.error,
    retry: () => {
      setRetryToken((token) => token + 1);
    },
  };
}
