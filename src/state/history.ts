import {
  useInfiniteQuery,
  type InfiniteData,
  type UseInfiniteQueryResult,
} from "@tanstack/react-query";
import { useState } from "react";

import type { CommitInfo, HistoryPage } from "../bindings";
import { layout } from "../lib/graph-layout/layout";
import type { GraphRow, LayoutState } from "../lib/graph-layout/types";
import { getCommits } from "../lib/ipc";

/** Commits requested per page. Matches the engine's bounded page size. */
const PAGE_SIZE = 500;

/** The cursor and walk roots that resume a traversal exactly. */
interface HistoryCursor {
  readonly cursor: string | null;
  readonly roots: string[] | null;
}

const FIRST_PAGE: HistoryCursor = { cursor: null, roots: null };

/** Everything the history view needs, derived once per page arrival. */
export interface HistoryData {
  readonly commits: readonly CommitInfo[];
  readonly rows: readonly GraphRow[];
  readonly maxLanes: number;
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  readonly isLoading: boolean;
  readonly error: Error | null;
  readonly fetchNextPage: () => void;
}

/** Layout progress after one page, so the walk can resume from it. */
interface Checkpoint {
  readonly commitCount: number;
  readonly rowCount: number;
  readonly state: LayoutState;
}

/** Every loaded commit and its graph row, plus what is needed to extend them. */
export interface HistoryLayout {
  readonly commits: readonly CommitInfo[];
  readonly rows: readonly GraphRow[];
  readonly maxLanes: number;
  readonly pages: readonly HistoryPage[];
  readonly checkpoints: readonly Checkpoint[];
}

const EMPTY_LAYOUT: HistoryLayout = {
  commits: [],
  rows: [],
  maxLanes: 0,
  pages: [],
  checkpoints: [],
};

/**
 * Lays out every loaded page, doing work only for pages that are new.
 *
 * `previous` is the result for an earlier list of pages. The leading pages that
 * are the very same objects keep their rows, because a page's layout depends
 * only on itself and the pages before it; the first page that differs — a
 * refetch after the repository changed, say — and everything after it is laid
 * out again from the state the last shared page left behind. Appending a page
 * therefore costs that page alone, not the whole history.
 */
export function layoutHistory(
  pages: readonly HistoryPage[],
  previous: HistoryLayout = EMPTY_LAYOUT,
): HistoryLayout {
  let shared = 0;
  while (
    shared < pages.length &&
    shared < previous.pages.length &&
    pages[shared] === previous.pages[shared]
  ) {
    shared += 1;
  }
  if (shared === pages.length && shared === previous.pages.length) {
    return previous;
  }

  const resumeFrom = previous.checkpoints[shared - 1];
  const commits = previous.commits.slice(0, resumeFrom?.commitCount ?? 0);
  const rows = previous.rows.slice(0, resumeFrom?.rowCount ?? 0);
  const checkpoints = previous.checkpoints.slice(0, shared);
  let state = resumeFrom?.state;

  for (const page of pages.slice(shared)) {
    const result = layout(
      page.commits.map((commit) => ({
        id: commit.id,
        parents: commit.parents,
      })),
      state,
    );
    commits.push(...page.commits);
    rows.push(...result.rows);
    state = result.state;
    checkpoints.push({
      commitCount: commits.length,
      rowCount: rows.length,
      state,
    });
  }

  return {
    commits,
    rows,
    maxLanes: state?.maxLanes ?? 0,
    pages,
    checkpoints,
  };
}

/** React Query cache identity for a repository's commit history. */
export function historyQueryKey(path: string | null) {
  return ["history", path] as const;
}

/**
 * Loads history one page at a time and lays out the graph incrementally.
 *
 * The layout is resumed from the previous page's state rather than recomputed,
 * which is what keeps lanes stable: recomputing from scratch would reassign
 * lanes for commits already on screen and the graph would jump under the
 * cursor while the user is reading it.
 */
export function useHistory(path: string | null): HistoryData {
  const query: UseInfiniteQueryResult<InfiniteData<HistoryPage>> =
    useInfiniteQuery({
      queryKey: historyQueryKey(path),
      enabled: path !== null,
      initialPageParam: FIRST_PAGE,
      queryFn: ({ pageParam }) => {
        if (path === null) throw new Error("No repository is open");
        return getCommits(path, {
          limit: PAGE_SIZE,
          cursor: pageParam.cursor,
          roots: pageParam.roots,
        });
      },
      getNextPageParam: (last): HistoryCursor | undefined =>
        last.next_cursor === null
          ? undefined
          : { cursor: last.next_cursor, roots: last.roots },
      /*
       * A walk is stable, but a repository is not: refs move and commits
       * arrive. Caching forever showed the repository as it was when it was
       * opened, so a commit made anywhere else never appeared. The watcher in
       * `useLiveRepository` invalidates this when the refs move; a short
       * stale time covers the gap when the watch could not be established.
       */
      staleTime: 30_000,
      gcTime: 5 * 60 * 1000,
    });

  const pages = query.data?.pages;

  // The previous layout is state rather than a ref so it can be read while
  // rendering: `layoutHistory` reuses it and lays out only what is new. Storing
  // the result while rendering is React's pattern for state derived from props.
  const [laidOut, setLaidOut] = useState<HistoryLayout>(EMPTY_LAYOUT);
  const current =
    pages === undefined ? EMPTY_LAYOUT : layoutHistory(pages, laidOut);
  if (current !== laidOut) setLaidOut(current);
  const { commits, rows, maxLanes } = current;

  return {
    commits,
    rows,
    maxLanes,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    isLoading: query.isLoading,
    error: query.error,
    fetchNextPage: () => {
      if (query.hasNextPage && !query.isFetchingNextPage) {
        void query.fetchNextPage();
      }
    },
  };
}
