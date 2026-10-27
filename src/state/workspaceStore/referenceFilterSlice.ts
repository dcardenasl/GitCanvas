import type { StateCreator } from "zustand";

import type { ReferenceFilterSlice, WorkspaceState } from "./types";

/** Persists reference exclusions independently for each canonical worktree. */
export const createReferenceFilterSlice: StateCreator<
  WorkspaceState,
  [],
  [],
  ReferenceFilterSlice
> = (set, get) => ({
  referenceFilters: [],
  referenceFilterUndo: {},
  setReferenceFilters: (preferences) => {
    const state = get();
    const exists = state.referenceFilters.some(
      (entry) => entry.path === preferences.path,
    );
    const limits = state.limits;
    if (
      limits === null ||
      (!exists &&
        state.referenceFilters.length >=
          limits.max_reference_filter_worktrees) ||
      preferences.excluded.length > limits.max_excluded_references ||
      new TextEncoder().encode(preferences.search).length >
        limits.max_reference_search_bytes
    ) {
      state.setStorageError({
        kind: "ResourceLimitExceeded",
        message: "Reference filter capacity exceeded",
      });
      return;
    }
    set({
      referenceFilters: [
        ...state.referenceFilters.filter(
          (entry) => entry.path !== preferences.path,
        ),
        preferences,
      ],
    });
  },
  changeReferenceFilters: (path, excluded) => {
    const state = get();
    const currentRecord = state.referenceFilters.find(
      (entry) => entry.path === path,
    );
    const search = currentRecord?.search ?? "";
    const previous = currentRecord?.excluded ?? [];
    const stack = state.referenceFilterUndo[path] ?? [];
    const nextExcluded = [...new Set(excluded)].sort();
    if (JSON.stringify(previous) === JSON.stringify(nextExcluded)) return;
    const limits = state.limits;
    if (
      limits === null ||
      (currentRecord === undefined &&
        state.referenceFilters.length >=
          limits.max_reference_filter_worktrees) ||
      nextExcluded.length > limits.max_excluded_references
    ) {
      state.setStorageError({
        kind: "ResourceLimitExceeded",
        message: "Reference filter capacity exceeded",
      });
      return;
    }
    const remaining = state.referenceFilters.filter(
      (entry) => entry.path !== path,
    );
    set({
      referenceFilters: [
        ...remaining,
        ...(nextExcluded.length === 0 && search === ""
          ? []
          : [{ path, excluded: nextExcluded, search }]),
      ],
      referenceFilterUndo: {
        ...state.referenceFilterUndo,
        [path]: [...stack, previous].slice(-50),
      },
    });
  },
  undoReferenceFilters: (path) => {
    const state = get();
    const stack = state.referenceFilterUndo[path] ?? [];
    if (stack.length === 0) return;
    const excluded = stack[stack.length - 1] ?? [];
    const remaining = stack.slice(0, -1);
    const currentRecord = state.referenceFilters.find(
      (entry) => entry.path === path,
    );
    const search = currentRecord?.search ?? "";
    const current = state.referenceFilters.filter(
      (entry) => entry.path !== path,
    );
    set({
      referenceFilters:
        excluded.length === 0 && search === ""
          ? current
          : [...current, { path, excluded: [...excluded], search }],
      referenceFilterUndo: { ...state.referenceFilterUndo, [path]: remaining },
    });
  },
  setReferenceSearch: (path, query) => {
    const state = get();
    const currentRecord = state.referenceFilters.find(
      (entry) => entry.path === path,
    );
    const maxBytes = state.limits?.max_reference_search_bytes ?? 0;
    const encoder = new TextEncoder();
    let boundedSearch = "";
    let searchBytes = 0;
    for (const character of query) {
      const characterBytes = encoder.encode(character).length;
      if (searchBytes + characterBytes > maxBytes) break;
      boundedSearch += character;
      searchBytes += characterBytes;
    }
    if ((currentRecord?.search ?? "") === boundedSearch) return;
    if (
      state.limits === null ||
      (currentRecord === undefined &&
        state.referenceFilters.length >=
          state.limits.max_reference_filter_worktrees)
    ) {
      state.setStorageError({
        kind: "ResourceLimitExceeded",
        message: "Reference filter capacity exceeded",
      });
      return;
    }
    const excluded = currentRecord?.excluded ?? [];
    set({
      referenceFilters:
        excluded.length === 0 && boundedSearch === ""
          ? state.referenceFilters.filter((entry) => entry.path !== path)
          : [
              ...state.referenceFilters.filter((entry) => entry.path !== path),
              { path, excluded, search: boundedSearch },
            ],
    });
  },
  clearReferenceSearch: (path) => {
    get().setReferenceSearch(path, "");
  },
});
