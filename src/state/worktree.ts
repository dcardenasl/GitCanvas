import { keepPreviousData, useQuery } from "@tanstack/react-query";

import type {
  WorktreeFileDiff,
  WorktreeFileDiffRequest,
  WorktreeFingerprint,
  WorktreeSnapshot,
  WorktreeSnapshotRequest,
} from "../bindings";
import {
  getWorktreeFileDiff,
  getWorktreeFingerprint,
  getWorktreeSnapshot,
} from "../lib/ipc";

export const WORKTREE_QUERY_KEY = "worktree";

const INITIAL_WORKTREE_REQUEST: WorktreeSnapshotRequest = {
  staged_cursor: null,
  unstaged_cursor: null,
  limit: null,
  expected_revision: null,
};

/** One bounded snapshot is the single source of truth for both local sides. */
export function useWorktreeSnapshot(
  repositoryPath: string | null,
  request: WorktreeSnapshotRequest = INITIAL_WORKTREE_REQUEST,
) {
  return useQuery<WorktreeSnapshot>({
    queryKey: [WORKTREE_QUERY_KEY, repositoryPath, request],
    enabled: repositoryPath !== null,
    queryFn: () => {
      if (repositoryPath === null) {
        throw new Error("No repository is open");
      }
      return getWorktreeSnapshot(repositoryPath, request);
    },
    placeholderData: keepPreviousData,
    staleTime: 1_000,
  });
}

/** Loads one local patch only after the user selects its file. */
export function useWorktreeFileDiff(
  repositoryPath: string | null,
  request: WorktreeFileDiffRequest | null,
) {
  return useQuery<WorktreeFileDiff>({
    queryKey: ["worktree-file-diff", repositoryPath, request],
    enabled: repositoryPath !== null && request !== null,
    queryFn: () => {
      if (repositoryPath === null || request === null) {
        throw new Error("No local file is selected");
      }
      return getWorktreeFileDiff(repositoryPath, request);
    },
    staleTime: 1_000,
  });
}

/** Poll interval while the native watcher is healthy, in milliseconds. */
const POLL_INTERVAL = 5_000;
/** Poll interval while it is degraded and polling is the only signal. */
const DEGRADED_POLL_INTERVAL = 2_000;
/** The slowest a poll is ever allowed to become. */
const MAX_POLL_INTERVAL = 60_000;
/** Idle time left between polls per unit of time a poll took. */
const POLL_DUTY_FACTOR = 10;

/**
 * How long to wait before the next fingerprint poll.
 *
 * Reading the fingerprint walks the index and the working tree, so on a large
 * repository one poll can take a noticeable share of a second. A fixed interval
 * would keep the machine busy checking; scaling the wait to the cost keeps the
 * poller at roughly a tenth of a core however big the repository is, while a
 * small one still refreshes on the base interval.
 */
export function pollInterval(baseMs: number, lastPollMs: number): number {
  return Math.min(
    MAX_POLL_INTERVAL,
    Math.max(baseMs, lastPollMs * POLL_DUTY_FACTOR),
  );
}

/** How long the last fingerprint read took, per repository. */
const lastPollDuration = new Map<string, number>();

/** Polling uses only a fingerprint, never a full diff payload. */
export function useWorktreeFingerprint(
  repositoryPath: string | null,
  degraded = false,
) {
  return useQuery<WorktreeFingerprint>({
    queryKey: ["worktree-fingerprint", repositoryPath],
    enabled: repositoryPath !== null,
    queryFn: async () => {
      if (repositoryPath === null) {
        throw new Error("No repository is open");
      }
      const started = performance.now();
      const fingerprint = await getWorktreeFingerprint(repositoryPath);
      lastPollDuration.set(repositoryPath, performance.now() - started);
      return fingerprint;
    },
    staleTime: 0,
    refetchInterval: () =>
      pollInterval(
        degraded ? DEGRADED_POLL_INTERVAL : POLL_INTERVAL,
        repositoryPath === null
          ? 0
          : (lastPollDuration.get(repositoryPath) ?? 0),
      ),
    refetchIntervalInBackground: false,
  });
}
