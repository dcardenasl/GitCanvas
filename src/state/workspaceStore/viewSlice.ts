import type { StateCreator } from "zustand";

import type { ViewSlice, WorkspaceState } from "./types";

/** No full-window view: the open project shows. Folded into any action that returns to it. */
export const NO_FULL_VIEW = {
  libraryView: null,
  githubOpen: false,
} as const;

/** The library and GitHub views replace the project, and never show together. */
export const createViewSlice: StateCreator<
  WorkspaceState,
  [],
  [],
  ViewSlice
> = (set) => ({
  libraryView: null,
  githubOpen: false,

  setLibraryView: (libraryView) => {
    set({ libraryView, githubOpen: false });
  },

  setGitHubOpen: (githubOpen) => {
    set({ githubOpen, ...(githubOpen ? { libraryView: null } : {}) });
  },
});
