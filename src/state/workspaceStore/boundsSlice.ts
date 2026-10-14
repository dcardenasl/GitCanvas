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

  /** Dismisses the current notice. */
  dismissNotice: () => {
    set({ notice: null });
  },
});
