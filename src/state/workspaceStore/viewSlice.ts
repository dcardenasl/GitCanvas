import type { StateCreator } from "zustand";

import type { ViewSlice, WorkspaceState } from "./types";

/** No full-window view: the open project shows. Folded into any action that returns to it. */
export const NO_FULL_VIEW = {
  homeOpen: false,
  githubOpen: false,
} as const;

/**
 * The home and GitHub views replace the project. Opening GitHub leaves home as
 * it was, so closing it returns to where it was opened from; going home closes it.
 */
export const createViewSlice: StateCreator<
  WorkspaceState,
  [],
  [],
  ViewSlice
> = (set) => ({
  homeOpen: false,
  githubOpen: false,

  setHomeOpen: (homeOpen) => {
    set({ homeOpen, githubOpen: false });
  },

  setGitHubOpen: (githubOpen) => {
    set({ githubOpen });
  },
});
