import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { StashComparisonMode } from "../bindings";
import { errorKind } from "../lib/errors";
import { getStashes, getStashFiles, getStashFingerprint } from "../lib/ipc";
import { shouldRetryLocalRead } from "../lib/query-retry";
import { invalidateLive, queryKeys } from "./queryKeys";
import { pollInterval } from "./worktree";
import { useNavigation, useNavigationActions } from "./workspace";

/** Debounces server-side search; every page still searches the complete snapshot. */
export function useStashes(root: string | null, search: string) {
  const selected = useNavigation((nav) => nav.stash?.entry.stash_id ?? null);
  const { updateStash } = useNavigationActions();
  const [settledSearch, setSearch] = useState(search);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(search);
    }, 200);
    return () => {
      clearTimeout(timer);
    };
  }, [search]);
  const client = useQueryClient();
  const key = queryKeys.stashes(root, settledSearch, selected);
  const query = useInfiniteQuery({
    queryKey: key,
    enabled: root !== null,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      if (root === null) throw new Error("No repository is open");
      return getStashes(root, {
        limit: null,
        cursor: pageParam,
        search: settledSearch,
        selected_stash_id: selected,
      });
    },
    getNextPageParam: (page) => page.next_cursor ?? undefined,
    staleTime: 1_000,
    retry: shouldRetryLocalRead,
  });
  const first = query.data?.pages[0];
  useEffect(() => {
    if (selected === null || first === undefined || query.error !== null)
      return;
    updateStash(selected, (view) => {
      const entry = first.selected_entry ?? view.entry;
      const removed = first.selected_present === false;
      return JSON.stringify(view.entry) === JSON.stringify(entry) &&
        removed === view.removed
        ? view
        : { ...view, entry, removed };
    });
  }, [first, selected, query.error, updateStash]);
  useEffect(() => {
    if (root === null) return;
    client.removeQueries({
      predicate: (item) =>
        item.queryKey[0] === "stash-list" &&
        item.queryKey[1] === root &&
        (item.queryKey[3] !== selected ||
          (item.queryKey[2] !== settledSearch && item.queryKey[2] !== "")),
    });
  }, [root, settledSearch, selected, client]);
  useEffect(() => {
    if (root !== null && errorKind(query.error) === "StaleCursor") {
      void client.resetQueries({
        queryKey: queryKeys.stashes(root, settledSearch, selected),
        exact: true,
      });
    }
  }, [root, settledSearch, selected, query.error, client]);
  return {
    ...query,
    entries: query.data?.pages.flatMap((page) => page.entries) ?? [],
    first,
    searching: search !== settledSearch,
  };
}

/** Immutable file summaries, with no patch or whole-file reads until selection. */
export function useStashFiles(
  root: string | null,
  id: string,
  mode: StashComparisonMode,
) {
  return useInfiniteQuery({
    queryKey: queryKeys.stashFiles(root, id, mode),
    enabled: root !== null,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => {
      if (root === null) throw new Error("No repository is open");
      return getStashFiles(root, {
        stash_id: id,
        mode,
        limit: null,
        cursor: pageParam,
      });
    },
    getNextPageParam: (page) => page.next_cursor ?? undefined,
    staleTime: Infinity,
  });
}

/** Only the active verified tab polls; cached immutable data is bounded per root. */
export function useStashRuntime(root: string | null, degraded: boolean) {
  const client = useQueryClient();
  const view = useNavigation((nav) => nav.stash);
  const duration = useRef(0);
  const fingerprint = useQuery({
    queryKey: queryKeys.stashFingerprint(root),
    enabled: root !== null,
    queryFn: async () => {
      if (root === null) throw new Error("No repository is open");
      const started = performance.now();
      try {
        return await getStashFingerprint(root);
      } finally {
        duration.current = performance.now() - started;
      }
    },
    retry: shouldRetryLocalRead,
    staleTime: 0,
    refetchInterval: () =>
      pollInterval(degraded ? 2_000 : 5_000, duration.current),
    refetchIntervalInBackground: false,
  });
  const previous = useRef<{ root: string; revision: string } | null>(null);
  useEffect(() => {
    if (root === null || fingerprint.data === undefined) return;
    const revision = fingerprint.data.revision;
    if (
      previous.current?.root === root &&
      previous.current.revision !== revision
    ) {
      void invalidateLive(client, root, "stashes");
    }
    previous.current = { root, revision };
  }, [root, fingerprint.data, client]);
  const id = view?.entry.stash_id;
  const fileKey = view?.file?.key;
  const expanded = view?.expanded;
  useEffect(() => {
    if (root === null) return;
    client.removeQueries({
      predicate: (query) => {
        const [family, owner, stash, , file, expansion] = query.queryKey;
        if (
          owner !== root ||
          !["stash-files", "stash-diff", "stash-content"].includes(
            String(family),
          )
        )
          return false;
        if (stash !== id) return true;
        if (family === "stash-files") return false;
        return (
          file !== fileKey ||
          (family === "stash-diff" ? expansion : query.queryKey[6]) !== expanded
        );
      },
    });
  }, [root, id, fileKey, expanded, client]);
  return fingerprint;
}
