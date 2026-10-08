import { create } from "zustand";

import type { RepositoryInfo } from "../bindings";

/** Origin of the selected file and the kind of content shown for it. */
export type FileSource = "commit" | "staged" | "unstaged";

/** A history, commit, or local-change selection supported by the interface. */
export type Selection =
  /** The commit history is the active view. */
  | { kind: "history" }
  /** A commit and optionally one of its changed files are selected. */
  | {
      kind: "commit";
      commitId: string;
      filePath: string | null;
      fileMode?: "snapshot";
    }
  /** One side of the local working tree and optionally one of its files. */
  | { kind: "worktree"; side: "staged" | "unstaged"; filePath: string | null };

interface SessionState {
  /** Repository currently open in the application. */
  readonly repository: RepositoryInfo | null;
  /** Current history, commit, or working-tree selection. */
  readonly selection: Selection;
  /** Commit requested for scrolling into view, until the view acknowledges it. */
  readonly revealCommitId: string | null;
  /** File whose bounded content is currently expanded. */
  readonly expandedFilePath: string | null;
  /** Opens a repository and resets navigation state. */
  openRepository: (repository: RepositoryInfo) => void;
  /** Closes the current repository and resets all navigation state. */
  closeRepository: () => void;
  /** Selects a commit, or returns to history when `id` is `null`. */
  selectCommit: (id: string | null) => void;
  /** Selects a file from a commit or local-change side; `null` clears the file selection. */
  selectFile: (
    path: string | null,
    source?: FileSource,
    mode?: "diff" | "snapshot",
  ) => void;
  /** Requests expanded content for a file that exceeded its initial read limit. */
  expandFile: (path: string) => void;
  /** Selects a commit and requests that the history view scroll it into view. */
  revealCommit: (id: string) => void;
  /** Clears the pending scroll request after the history view handles it. */
  clearReveal: () => void;
  /** Clears a reveal request and returns to history if its commit is still selected. */
  clearOrphanedReveal: () => void;
}

const EMPTY = {
  selection: { kind: "history" } as const,
  revealCommitId: null,
  expandedFilePath: null,
} as const;

/**
 * Repository and navigation state shared by the application panels.
 * Opening or closing a repository resets selection, reveal, and expansion state.
 */
export const useSession = create<SessionState>((set) => ({
  repository: null,
  ...EMPTY,

  openRepository: (repository) => {
    set({ repository, ...EMPTY });
  },

  closeRepository: () => {
    set({ repository: null, ...EMPTY });
  },

  selectCommit: (id) => {
    set((state) => ({
      selection:
        id === null
          ? { kind: "history" }
          : state.selection.kind === "commit" && state.selection.commitId === id
            ? state.selection
            : { kind: "commit", commitId: id, filePath: null },
      expandedFilePath:
        id !== null &&
        state.selection.kind === "commit" &&
        state.selection.commitId === id
          ? state.expandedFilePath
          : null,
    }));
  },

  selectFile: (path, source = "commit", mode = "diff") => {
    set((state) => {
      if (path === null) {
        if (state.selection.kind === "commit") {
          return {
            selection: {
              kind: "commit",
              commitId: state.selection.commitId,
              filePath: null,
            },
            expandedFilePath: null,
          };
        }
        return { selection: { kind: "history" }, expandedFilePath: null };
      }

      if (source === "commit") {
        if (state.selection.kind !== "commit") {
          return {
            selection: { kind: "history" },
            expandedFilePath: null,
          };
        }
        return {
          selection: {
            kind: "commit",
            commitId: state.selection.commitId,
            filePath: path,
            ...(mode === "snapshot" ? { fileMode: "snapshot" as const } : {}),
          },
          expandedFilePath: null,
        };
      }

      return {
        selection: { kind: "worktree", side: source, filePath: path },
        expandedFilePath: null,
      };
    });
  },

  expandFile: (path) => {
    set({ expandedFilePath: path });
  },

  revealCommit: (id) => {
    set({
      selection: { kind: "commit", commitId: id, filePath: null },
      expandedFilePath: null,
      revealCommitId: id,
    });
  },

  clearReveal: () => {
    set({ revealCommitId: null });
  },

  clearOrphanedReveal: () => {
    set((state) => {
      const revealCommitId = state.revealCommitId;
      if (revealCommitId === null) return state;

      const selection =
        state.selection.kind === "commit" &&
        state.selection.commitId === revealCommitId
          ? { kind: "history" as const }
          : state.selection;

      return { revealCommitId: null, selection };
    });
  },
}));

/**
 * Returns the selected commit id, or `null` when history itself is selected.
 *
 * @param state - Current session state.
 * @returns The commit id for a commit selection; otherwise `null`.
 */
export function selectedCommitId(state: SessionState): string | null {
  return state.selection.kind === "commit" && state.selection.commitId !== ""
    ? state.selection.commitId
    : null;
}

/**
 * Returns the selected file path across commit and worktree views.
 *
 * @param state - Current session state.
 * @returns The selected path, or `null` for history without a file.
 */
export function selectedFilePath(state: SessionState): string | null {
  return state.selection.kind === "history" ? null : state.selection.filePath;
}

/**
 * Returns the source of a file selection.
 *
 * @param selection - Current navigation selection.
 * @returns Its commit or working-tree source, or `null` when no file is selected.
 */
export function selectedFileSource(selection: Selection): FileSource | null {
  if (selection.kind === "history") return null;
  return selection.kind === "commit" ? "commit" : selection.side;
}
