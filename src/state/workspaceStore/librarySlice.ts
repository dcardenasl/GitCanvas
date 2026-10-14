import type { StateCreator } from "zustand";

import type { LibrarySlice, WorkspaceState } from "./types";

/**
 * The recents after `root` was used: it goes first, once, and the list keeps to
 * the backend's bound.
 *
 * Without the bound being known the list is left alone — truncating to nothing
 * on the strength of a missing number would erase it. Pure, so the tab actions
 * that count as using a project can fold the change into their own update.
 */
export function recentsAfterVisit(
  state: Pick<WorkspaceState, "recents" | "limits">,
  root: string,
): readonly string[] {
  if (state.limits === null) return state.recents;
  return [root, ...state.recents.filter((path) => path !== root)].slice(
    0,
    state.limits.max_recents,
  );
}

/** Favorites and recents, and the limits they keep to. */
export const createLibrarySlice: StateCreator<
  WorkspaceState,
  [],
  [],
  LibrarySlice
> = (set, get) => ({
  favorites: [],
  recents: [],

  /** Stars or unstars a project; at the limit it says so instead. */
  toggleFavorite: (root) => {
    const { favorites, limits } = get();
    if (favorites.includes(root)) {
      set({ favorites: favorites.filter((path) => path !== root) });
      return;
    }
    if (limits === null) throw new Error("Workspace limits are not loaded");
    if (favorites.length >= limits.max_favorites) {
      set({ notice: { code: "favoriteLimit", max: limits.max_favorites } });
      return;
    }
    set({ favorites: [...favorites, root] });
  },

  /** Forgets a recent project without touching the project itself. */
  removeRecent: (root) => {
    set({ recents: get().recents.filter((path) => path !== root) });
  },
});
