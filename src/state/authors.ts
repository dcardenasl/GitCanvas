import { useEffect } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { create } from "zustand";

import { commands } from "../bindings";
import type { AppError, AuthorCount, AuthorKey } from "../bindings";
import { queryKeys } from "./queryKeys";
import { errorMessage } from "../lib/errors";

interface AuthorSelectionState {
  readonly selected: Readonly<Record<string, AuthorKey | null>>;
  readonly select: (root: string, author: AuthorKey | null) => void;
}

const useAuthorSelectionStore = create<AuthorSelectionState>((set) => ({
  selected: {},
  select: (root, author) => {
    set((state) => ({ selected: { ...state.selected, [root]: author } }));
  },
}));

class AuthorQueryError extends Error {
  readonly kind: AppError["kind"];

  constructor(error: AppError) {
    super(errorMessage(error));
    this.name = "AuthorQueryError";
    this.kind = error.kind;
  }
}

async function unwrap<T>(
  response: Promise<
    | { readonly status: "ok"; readonly data: T }
    | {
        readonly status: "error";
        readonly error: AppError;
      }
  >,
): Promise<T> {
  const result = await response;
  if (result.status === "error") throw new AuthorQueryError(result.error);
  return result.data;
}

/** Loads and accumulates the repository's delta based author catalog. */
export function useAuthorCatalog(root: string | null) {
  const client = useQueryClient();
  const query = useInfiniteQuery({
    queryKey: queryKeys.authorCatalog(root),
    enabled: root !== null,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      if (root === null) throw new Error("No repository is open");
      return unwrap(
        commands.getAuthorCatalogChunk(root, {
          cursor: pageParam,
          cancelled: false,
        }),
      );
    },
    getNextPageParam: (page) => page.cursor ?? undefined,
    staleTime: 0,
  });
  const authors = new Map<string, AuthorCount>();
  for (const page of query.data?.pages ?? []) {
    for (const item of page.authors) {
      const key = JSON.stringify(item.author);
      const previous = authors.get(key);
      authors.set(key, {
        author: item.author,
        commits: (previous?.commits ?? 0) + item.commits,
      });
    }
  }
  const last = query.data?.pages.at(-1);
  useEffect(() => {
    if (
      !(query.error instanceof AuthorQueryError) ||
      query.error.kind !== "StaleCursor"
    )
      return;
    void client.resetQueries({ queryKey: queryKeys.authorCatalog(root) });
  }, [client, query.error, root]);
  return {
    ...query,
    authors: [...authors.values()].sort(
      (left, right) =>
        left.author.name.localeCompare(right.author.name) ||
        left.author.email.localeCompare(right.author.email),
    ),
    scanned: last?.scanned ?? 0,
    complete: last?.complete ?? false,
    incompleteReason: last?.incomplete_reason ?? null,
  };
}

/** Repository-scoped author selection, shared by the panel and graph consumers. */
export function useSelectedAuthor(root: string | null) {
  const author = useAuthorSelectionStore((state) =>
    root === null ? null : (state.selected[root] ?? null),
  );
  const select = useAuthorSelectionStore((state) => state.select);
  return {
    author,
    select: (next: AuthorKey | null) => {
      if (root !== null) select(root, next);
    },
  };
}

/** Pages one author's complete commit list for navigation, including unloaded commits. */
export function useAuthorCommitIds(
  root: string | null,
  author: AuthorKey | null,
) {
  const query = useInfiniteQuery({
    queryKey: queryKeys.authorCommits(root, author),
    enabled: root !== null && author !== null,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      if (root === null || author === null)
        throw new Error(
          "Author commits were queried without a repository and author",
        );
      return unwrap(
        commands.getAuthorCommitIds(root, { author, cursor: pageParam }),
      );
    },
    getNextPageParam: (page) => page.next_cursor ?? undefined,
    staleTime: Number.POSITIVE_INFINITY,
  });
  return {
    ...query,
    commitIds: query.data?.pages.flatMap((page) => page.commit_ids) ?? [],
  };
}

/** Finds the adjacent author commit, fetching pages until the current id is found. */
export async function adjacentAuthorCommit(
  query: ReturnType<typeof useAuthorCommitIds>,
  currentCommitId: string,
  direction: "previous" | "next",
): Promise<string | null> {
  let pages = query.data?.pages ?? [];
  let ids = pages.flatMap((page) => page.commit_ids);
  let currentIndex = ids.indexOf(currentCommitId);
  let hasNextPage = query.hasNextPage;
  while (currentIndex < 0 && hasNextPage) {
    const next = await query.fetchNextPage();
    pages = next.data?.pages ?? pages;
    ids = pages.flatMap((page) => page.commit_ids);
    currentIndex = ids.indexOf(currentCommitId);
    hasNextPage = next.hasNextPage;
  }
  if (currentIndex < 0) return null;
  const target = currentIndex + (direction === "next" ? 1 : -1);
  if (target >= 0 && target < ids.length) return ids[target] ?? null;
  while (target >= ids.length && hasNextPage) {
    const next = await query.fetchNextPage();
    pages = next.data?.pages ?? pages;
    const expanded = pages.flatMap((page) => page.commit_ids);
    ids = expanded;
    hasNextPage = next.hasNextPage;
  }
  return target < 0 ? null : (ids[target] ?? null);
}
