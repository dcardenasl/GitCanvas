import type { StateCreator } from "zustand";
import type { GraphSlice, WorkspaceState } from "./types";

/** Updates presentation preferences without touching Git or closing tabs. */
export const createGraphSlice: StateCreator<
  WorkspaceState,
  [],
  [],
  GraphSlice
> = (set, get) => ({
  graphPreferences: [],
  setGraphPreferences: (preferences) => {
    const state = get();
    const exists = state.graphPreferences.some(
      (p) => p.path === preferences.path,
    );
    const limits = state.limits;
    if (
      limits === null ||
      (!exists && state.graphPreferences.length >= limits.max_graph_projects) ||
      preferences.colors.length > limits.max_graph_references
    ) {
      state.setStorageError(new Error("Graph preference capacity exceeded"));
      return;
    }
    set({
      graphPreferences: [
        ...state.graphPreferences.filter((p) => p.path !== preferences.path),
        preferences,
      ],
    });
  },
});
