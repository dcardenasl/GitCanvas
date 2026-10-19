import type { StateCreator } from "zustand";

import { restoreTab } from "../workspaceRecords";
import type { StorageSlice, WorkspaceState } from "./types";

/** Persistence failures, and putting a stored workspace back. */
export const createStorageSlice: StateCreator<
  WorkspaceState,
  [],
  [],
  StorageSlice
> = (set, get) => ({
  storageError: null,

  /** Puts back a validated workspace as tabs that still need checking. */
  restore: (workspace) => {
    set({
      tabs: workspace.tabs.map(restoreTab),
      activeRoot: workspace.active ?? workspace.tabs[0]?.path ?? null,
      favorites: workspace.favorites,
      recents: workspace.recents,
      graphPreferences: workspace.graph_preferences,
    });
  },

  /** Reports a persistence failure, or clears a save failure with `null`. */
  setStorageError: (cause, kind = "save") => {
    // A recovery notice is about data already set aside; a later successful
    // save does not make it untrue, so only dismissing it clears it.
    if (cause === null && get().storageError?.kind === "recovery") return;
    set({ storageError: cause === null ? null : { cause, kind } });
  },

  /** Dismisses the storage failure, whatever its kind. */
  dismissStorageError: () => {
    set({ storageError: null });
  },
});
