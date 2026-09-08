import { create } from "zustand";

import type { RepositoryInfo } from "../bindings";

/**
 * Interface state.
 *
 * Deliberately separate from React Query, which owns everything that comes
 * from Rust. This store holds only what the user has chosen: which repository
 * is open, which commit is selected, which file is being read, and whether the
 * history has been asked to scroll somewhere. Mixing the two is how a cache
 * invalidation ends up clearing a selection.
 */
interface SessionState {
  readonly repository: RepositoryInfo | null;
  readonly selectedCommitId: string | null;
  /**
   * The file open in the centre panel, or `null` when the graph is showing.
   *
   * The centre panel shows one thing at a time, so this single value is the
   * whole switch: there is no separate "which view" flag that could disagree
   * with it.
   */
  readonly selectedFilePath: string | null;
  /**
   * A commit the history has been asked to scroll to.
   *
   * Separate from `selectedCommitId` because selecting and revealing are
   * different intents: clicking a row selects without scrolling, clicking a
   * branch does both. Cleared once the scroll happens, so re-selecting the
   * same commit later scrolls again.
   */
  readonly revealCommitId: string | null;
  /**
   * The file whose size guard the reader has explicitly lifted.
   *
   * Separate from `selectedFilePath` because opening a large file and asking
   * for all of it are different decisions: the first is cheap, the second is
   * what the guard exists to make deliberate.
   */
  readonly expandedFilePath: string | null;

  openRepository: (repository: RepositoryInfo) => void;
  closeRepository: () => void;
  selectCommit: (id: string | null) => void;
  selectFile: (path: string | null) => void;
  expandFile: (path: string) => void;
  revealCommit: (id: string) => void;
  clearReveal: () => void;
}

const EMPTY = {
  selectedCommitId: null,
  selectedFilePath: null,
  revealCommitId: null,
  expandedFilePath: null,
} as const;

export const useSession = create<SessionState>((set) => ({
  repository: null,
  ...EMPTY,

  openRepository: (repository) => {
    // A different repository invalidates every selection; keeping one would
    // leave the inspector showing a commit that is not in this history.
    set({ repository, ...EMPTY });
  },

  closeRepository: () => {
    set({ repository: null, ...EMPTY });
  },

  selectCommit: (id) => {
    // Changing commit closes the open file: the same path in another commit is
    // a different diff, and silently swapping the content under the reader is
    // worse than returning to the graph.
    set((state) => ({
      selectedCommitId: id,
      selectedFilePath:
        state.selectedCommitId === id ? state.selectedFilePath : null,
      expandedFilePath:
        state.selectedCommitId === id ? state.expandedFilePath : null,
    }));
  },

  selectFile: (path) => {
    // Closing or switching file drops the expansion: a guard the reader lifted
    // for one file says nothing about the next one.
    set({ selectedFilePath: path, expandedFilePath: null });
  },

  expandFile: (path) => {
    set({ expandedFilePath: path });
  },

  revealCommit: (id) => {
    set({
      selectedCommitId: id,
      selectedFilePath: null,
      expandedFilePath: null,
      revealCommitId: id,
    });
  },

  clearReveal: () => {
    set({ revealCommitId: null });
  },
}));
