import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import type {
  FileDiffSummary,
  WorktreeFileDiff,
  WorktreeFileDiffRequest,
  WorktreeFingerprint,
  WorktreeSnapshot,
  WorktreeSnapshotRequest,
} from "../bindings";
import { shouldRetryLocalRead } from "../lib/query-retry";
import {
  getWorktreeFileDiff,
  getWorktreeFingerprint,
  getWorktreeSnapshot,
} from "../lib/ipc";
import { queryKeys } from "./queryKeys";

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
    queryKey: queryKeys.worktree(repositoryPath, request),
    enabled: repositoryPath !== null,
    queryFn: () => {
      if (repositoryPath === null) {
        throw new Error("No repository is open");
      }
      return getWorktreeSnapshot(repositoryPath, request);
    },
    placeholderData: keepPreviousData,
    staleTime: 1_000,
    retry: shouldRetryLocalRead,
  });
}

type WorktreeSideName = "staged" | "unstaged";

/** One side of the local changes, including pages fetched after the first. */
export interface LocalSide {
  /** Every file loaded so far, in the order the backend listed them. */
  readonly files: readonly FileDiffSummary[];
  /** Files on this side in total, loaded or not. */
  readonly totalFiles: number;
  /** Lines added across the whole side, not only the loaded files. */
  readonly insertions: number;
  readonly deletions: number;
  /** Files still waiting on the backend. */
  readonly remaining: number;
}

/** Pages fetched beyond the first, valid only for the revision they came from. */
interface ExtraPages {
  readonly revision: string;
  readonly staged: SideExtra;
  readonly unstaged: SideExtra;
}

interface SideExtra {
  readonly files: readonly FileDiffSummary[];
  /** `undefined` until a page is fetched; then the cursor for the next one. */
  readonly next?: string | null;
}

const NO_EXTRA: SideExtra = { files: [] };

/**
 * Both sides of the local changes, with the ability to load the rest.
 *
 * The backend lists at most a page of files at a time. Showing only the first
 * page would silently hide every file beyond it, and the counts beside them
 * would be wrong, so the totals come from the backend and the remainder is
 * loaded on request. Extra pages belong to one revision: once the working tree
 * changes the listing is read again from the start.
 */
export function useWorktreeFiles(repositoryPath: string | null) {
  const snapshot = useWorktreeSnapshot(repositoryPath);
  const [extra, setExtra] = useState<ExtraPages | null>(null);
  const [loading, setLoading] = useState<WorktreeSideName | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const data = snapshot.data;
  const current =
    data !== undefined && extra?.revision === data.revision ? extra : null;

  const side = (name: WorktreeSideName): LocalSide | null => {
    if (data === undefined) return null;
    const page = data[name];
    const more = current?.[name] ?? NO_EXTRA;
    const files = [...page.files, ...more.files];
    return {
      files,
      totalFiles: page.total_files,
      insertions: page.insertions,
      deletions: page.deletions,
      remaining: Math.max(page.total_files - files.length, 0),
    };
  };

  const loadMore = useCallback(
    async (name: WorktreeSideName) => {
      if (repositoryPath === null || data === undefined || loading !== null) {
        return;
      }
      const more =
        (extra?.revision === data.revision ? extra[name] : undefined) ??
        NO_EXTRA;
      const cursor =
        more.next === undefined ? data[name].next_cursor : more.next;
      if (cursor === null) return;

      setLoading(name);
      setError(null);
      try {
        const page = await getWorktreeSnapshot(repositoryPath, {
          staged_cursor: name === "staged" ? cursor : null,
          unstaged_cursor: name === "unstaged" ? cursor : null,
          limit: null,
          expected_revision: data.revision,
        });
        const fetched = page[name];
        setExtra((previous) => {
          const base: ExtraPages =
            previous?.revision === data.revision
              ? previous
              : {
                  revision: data.revision,
                  staged: NO_EXTRA,
                  unstaged: NO_EXTRA,
                };
          return {
            ...base,
            [name]: {
              files: [...base[name].files, ...fetched.files],
              next: fetched.next_cursor,
            },
          };
        });
      } catch (cause) {
        // The changes moved on while the page was loading. The listing is read
        // again from the start rather than stitched together from two states.
        setExtra(null);
        void snapshot.refetch();
        setError(cause instanceof Error ? cause : new Error(String(cause)));
      } finally {
        setLoading(null);
      }
    },
    [repositoryPath, data, extra, loading, snapshot],
  );

  return {
    snapshot,
    staged: side("staged"),
    unstaged: side("unstaged"),
    loadMore,
    loadingSide: loading,
    loadError: error,
  };
}

/** Loads one local patch only after the user selects its file. */
export function useWorktreeFileDiff(
  repositoryPath: string | null,
  request: WorktreeFileDiffRequest | null,
) {
  return useQuery<WorktreeFileDiff>({
    queryKey: queryKeys.worktreeFileDiff(repositoryPath, request),
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
    queryKey: queryKeys.worktreeFingerprint(repositoryPath),
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
    retry: shouldRetryLocalRead,
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
