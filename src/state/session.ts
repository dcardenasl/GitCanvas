import { create } from "zustand";

import type { RepositoryInfo } from "../bindings";

/**
 * Interface state.
 *
 * Deliberately separate from React Query, which owns everything that comes
 * from Rust. This store holds only what the user has chosen: which repository
 * is open and which commit is selected. Mixing the two is how a cache
 * invalidation ends up clearing a selection.
 */
interface SessionState {
  readonly repository: RepositoryInfo | null;
  readonly selectedCommitId: string | null;
  openRepository: (repository: RepositoryInfo) => void;
  closeRepository: () => void;
  selectCommit: (id: string | null) => void;
}

export const useSession = create<SessionState>((set) => ({
  repository: null,
  selectedCommitId: null,
  openRepository: (repository) => {
    // A different repository invalidates the selection; keeping it would
    // leave the inspector showing a commit that is not in this history.
    set({ repository, selectedCommitId: null });
  },
  closeRepository: () => {
    set({ repository: null, selectedCommitId: null });
  },
  selectCommit: (id) => {
    set({ selectedCommitId: id });
  },
}));
