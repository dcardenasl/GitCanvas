import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import type { FileHistoryRow, Truncation } from "../bindings";
import { getFileHistory } from "../lib/ipc";
import type { FileHistoryView } from "./navigation";
import { queryKeys } from "./queryKeys";

/** Rows requested per page: the engine's largest page, so one round trip fills a screen. */
export const FILE_HISTORY_PAGE_SIZE = 200;

/** A file's history as loaded so far, with what the engine reported about its bounds. */
export interface FileHistoryData {
  readonly rows: readonly FileHistoryRow[];
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  readonly isLoading: boolean;
  readonly error: Error | null;
  /** Why the last loaded page ended early, if a bound was reached. */
  readonly truncation: Truncation | null;
  /** Whether the repository is shallow, so the oldest row may not be where the file began. */
  readonly shallow: boolean;
  readonly fetchNextPage: () => void;
  readonly retry: () => void;
}

/** Why a file's history cannot be opened from a start commit, or `null` when it can. */
export type FileHistoryUnavailable = "noCommits" | "notUtf8";

/**
 * Whether the history of `path` can be opened from `startCommitId`.
 *
 * A repository without commits has no start to walk from. A path that the
 * interface received with U+FFFD replacements was not valid UTF-8 in Git, so its
 * exact name cannot be sent back to the engine.
 */
export function fileHistoryUnavailable(
  path: string,
  startCommitId: string | null,
): FileHistoryUnavailable | null {
  if (startCommitId === null) return "noCommits";
  if (path.includes("\uFFFD")) return "notUtf8";
  return null;
}

/**
 * Loads the history of `view.path` from `view.startCommitId`, one page at a time.
 *
 * The query key carries the repository root, so the cache entry belongs to one
 * project and is released with it. A start commit names an immutable snapshot,
 * so its pages never go stale; a refresh from a new HEAD is a different query.
 */
export function useFileHistory(
  root: string | null,
  view: FileHistoryView | null,
): FileHistoryData {
  const query = useInfiniteQuery({
    queryKey: queryKeys.fileHistory(
      root,
      view?.path ?? null,
      view?.startCommitId ?? null,
    ),
    queryFn: ({ pageParam }) => {
      if (root === null || view === null) {
        throw new Error("File history was queried without an open view");
      }
      return getFileHistory(root, {
        path: view.path,
        start: view.startCommitId,
        limit: FILE_HISTORY_PAGE_SIZE,
        cursor: pageParam,
        focus_commit: null,
      });
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    enabled: root !== null && view !== null,
    staleTime: Number.POSITIVE_INFINITY,
  });

  const pages = query.data?.pages;
  const rows = useMemo(
    () => (pages ?? []).flatMap((page) => page.rows),
    [pages],
  );
  const last = pages?.at(-1);
  return {
    rows,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    isLoading: query.isPending && query.fetchStatus !== "idle",
    error: query.error,
    truncation: last?.truncation ?? null,
    shallow: pages?.[0]?.shallow ?? false,
    fetchNextPage: () => {
      void query.fetchNextPage();
    },
    retry: () => {
      void query.refetch();
    },
  };
}
