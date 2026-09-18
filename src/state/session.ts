import { create } from "zustand";

import type { RepositoryInfo } from "../bindings";

export type FileSource = "commit" | "staged" | "unstaged";

/** The only legal interface selections. */
export type Selection =
  | { kind: "history" }
  | {
      kind: "commit";
      commitId: string;
      filePath: string | null;
      fileMode?: "snapshot";
    }
  | { kind: "worktree"; side: "staged" | "unstaged"; filePath: string | null };

interface SessionState {
  readonly repository: RepositoryInfo | null;
  readonly selection: Selection;
  readonly revealCommitId: string | null;
  readonly expandedFilePath: string | null;
  openRepository: (repository: RepositoryInfo) => void;
  closeRepository: () => void;
  selectCommit: (id: string | null) => void;
  selectFile: (
    path: string | null,
    source?: FileSource,
    mode?: "diff" | "snapshot",
  ) => void;
  expandFile: (path: string) => void;
  revealCommit: (id: string) => void;
  clearReveal: () => void;
}

const EMPTY = {
  selection: { kind: "history" } as const,
  revealCommitId: null,
  expandedFilePath: null,
} as const;

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
}));

export function selectedCommitId(state: SessionState): string | null {
  return state.selection.kind === "commit" && state.selection.commitId !== ""
    ? state.selection.commitId
    : null;
}

export function selectedFilePath(state: SessionState): string | null {
  return state.selection.kind === "history" ? null : state.selection.filePath;
}

export function selectedFileSource(state: SessionState): FileSource | null {
  if (state.selection.kind === "history") return null;
  return state.selection.kind === "commit" ? "commit" : state.selection.side;
}
