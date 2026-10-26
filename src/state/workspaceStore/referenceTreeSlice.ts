import type { StateCreator } from "zustand";

import type { ReferenceTreeSlice, WorkspaceState } from "./types";

/** Persists tree expansion independently for each canonical worktree. */
export const createReferenceTreeSlice: StateCreator<
  WorkspaceState,
  [],
  [],
  ReferenceTreeSlice
> = (set, get) => ({
  referenceTreePreferences: [],
  setReferenceTreeCollapsed: (path, collapsed) => {
    const state = get();
    const current = state.referenceTreePreferences.find(
      (preference) => preference.path === path,
    );
    const nextCollapsed = [...new Set(collapsed)].sort();
    if (
      JSON.stringify(current?.collapsed ?? []) === JSON.stringify(nextCollapsed)
    )
      return;

    const limits = state.limits;
    if (
      limits === null ||
      (current === undefined &&
        state.referenceTreePreferences.length >=
          limits.max_reference_tree_worktrees) ||
      nextCollapsed.length > limits.max_collapsed_reference_folders
    ) {
      state.setStorageError({
        kind: "ResourceLimitExceeded",
        message: "Reference tree preference capacity exceeded",
      });
      return;
    }

    set({
      referenceTreePreferences:
        nextCollapsed.length === 0
          ? state.referenceTreePreferences.filter(
              (preference) => preference.path !== path,
            )
          : [
              ...state.referenceTreePreferences.filter(
                (preference) => preference.path !== path,
              ),
              { path, collapsed: nextCollapsed },
            ],
    });
  },
});
