import {
  useInfiniteQuery,
  type InfiniteData,
  type UseInfiniteQueryResult,
} from "@tanstack/react-query";
import { useMemo } from "react";

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
export interface HistoryView {
  readonly commits: readonly CommitInfo[];
  readonly rows: readonly GraphRow[];
  readonly maxLanes: number;
  readonly hasNextPage: boolean;
  readonly isFetchingNextPage: boolean;
  readonly isLoading: boolean;
  readonly error: Error | null;
  readonly fetchNextPage: () => void;
}

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
export function useHistory(path: string | null): HistoryView {
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
      // History is immutable once walked, so a page never needs refetching.
      staleTime: Infinity,
      gcTime: 5 * 60 * 1000,
    });

  const pages = query.data?.pages;

  const { commits, rows, maxLanes } = useMemo(() => {
    if (pages === undefined) {
      return { commits: [], rows: [], maxLanes: 0 };
    }

    const allCommits: CommitInfo[] = [];
    const allRows: GraphRow[] = [];
    let state: LayoutState | undefined;

    for (const page of pages) {
      allCommits.push(...page.commits);
      const result = layout(
        page.commits.map((commit) => ({
          id: commit.id,
          parents: commit.parents,
        })),
        state,
      );
      allRows.push(...result.rows);
      state = result.state;
    }

    return {
      commits: allCommits,
      rows: allRows,
      maxLanes: state?.maxLanes ?? 0,
    };
  }, [pages]);

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
