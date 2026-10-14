import type { StateCreator } from "zustand";

import type { BoundsSlice, WorkspaceState } from "./types";

/** The bounds the backend enforces, and the notice that cites them. */
export const createBoundsSlice: StateCreator<
  WorkspaceState,
  [],
  [],
  BoundsSlice
> = (set) => ({
  limits: null,
  notice: null,

  /** Records the bounds read from the backend at startup. */
  setLimits: (limits) => {
    set({ limits });
  },

  /** Tells the person something, replacing whatever was there. */
  notify: (notice) => {
    set({ notice });
  },

  /** Dismisses the current notice. */
  dismissNotice: () => {
    set({ notice: null });
  },
});
