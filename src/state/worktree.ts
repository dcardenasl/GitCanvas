import { keepPreviousData, useQuery } from "@tanstack/react-query";

import type {
  WorktreeFileDiff,
  WorktreeFileDiffRequest,
  WorktreeFingerprint,
  WorktreeSnapshot,
  WorktreeSnapshotRequest,
} from "../bindings";
import {
  getWorktreeFileDiff,
  getWorktreeFingerprint,
  getWorktreeSnapshot,
} from "../lib/ipc";

export const WORKTREE_QUERY_KEY = "worktree";

const INITIAL_WORKTREE_REQUEST: WorktreeSnapshotRequest = {
  staged_cursor: null,
  unstaged_cursor: null,
  limit: null,
  expected_revision: null,
};

/** One bounded snapshot is the single source of truth for both local sides. */
export function useWorktreeSnapshot(
  repositoryPath: string | null,
  request: WorktreeSnapshotRequest = INITIAL_WORKTREE_REQUEST,
) {
  return useQuery<WorktreeSnapshot>({
    queryKey: [WORKTREE_QUERY_KEY, repositoryPath, request],
    enabled: repositoryPath !== null,
    queryFn: () => {
      if (repositoryPath === null) {
        throw new Error("No hay un repositorio abierto");
      }
      return getWorktreeSnapshot(repositoryPath, request);
    },
    placeholderData: keepPreviousData,
    staleTime: 1_000,
  });
}

/** Loads one local patch only after the user selects its file. */
export function useWorktreeFileDiff(
  repositoryPath: string | null,
  request: WorktreeFileDiffRequest | null,
) {
  return useQuery<WorktreeFileDiff>({
    queryKey: ["worktree-file-diff", repositoryPath, request],
    enabled: repositoryPath !== null && request !== null,
    queryFn: () => {
      if (repositoryPath === null || request === null) {
        throw new Error("No hay un archivo local seleccionado");
      }
      return getWorktreeFileDiff(repositoryPath, request);
    },
    staleTime: 1_000,
  });
}

/** Polling uses only a fingerprint, never a full diff payload. */
export function useWorktreeFingerprint(
  repositoryPath: string | null,
  degraded = false,
) {
  return useQuery<WorktreeFingerprint>({
    queryKey: ["worktree-fingerprint", repositoryPath],
    enabled: repositoryPath !== null,
    queryFn: () => {
      if (repositoryPath === null) {
        throw new Error("No hay un repositorio abierto");
      }
      return getWorktreeFingerprint(repositoryPath);
    },
    staleTime: 0,
    refetchInterval: degraded ? 2_000 : 5_000,
    refetchIntervalInBackground: false,
  });
}
