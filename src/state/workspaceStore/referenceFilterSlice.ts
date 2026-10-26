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
  referenceSearches: {},
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
      preferences.excluded.length > limits.max_excluded_references
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
    set({
      referenceFilters: [
        ...state.referenceFilters.filter((entry) => entry.path !== path),
        { path, excluded: nextExcluded },
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
    const current = state.referenceFilters.filter(
      (entry) => entry.path !== path,
    );
    set({
      referenceFilters:
        excluded.length === 0
          ? current
          : [...current, { path, excluded: [...excluded] }],
      referenceFilterUndo: { ...state.referenceFilterUndo, [path]: remaining },
    });
  },
  setReferenceSearch: (path, query) => {
    set((state) => ({
      referenceSearches: { ...state.referenceSearches, [path]: query },
    }));
  },
  clearReferenceSearch: (path) => {
    set((state) => {
      return {
        referenceSearches: Object.fromEntries(
          Object.entries(state.referenceSearches).filter(
            ([root]) => root !== path,
          ),
        ),
      };
    });
  },
});
