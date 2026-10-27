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

/**
 * Where one project's view was left: what is selected and what is pending.
 *
 * Plain data with pure transitions, so every project's navigation is a value
 * that can be kept, compared and replaced without a store knowing how it
 * changes.
 */
export interface Navigation {
  /** Current history, commit, or working-tree selection. */
  readonly selection: Selection;
  /** Commit requested for scrolling into view, until the view acknowledges it. */
  readonly revealCommitId: string | null;
  /** File whose bounded content is currently expanded. */
  readonly expandedFilePath: string | null;
  /** What was typed in the commit search. */
  readonly searchQuery: string;
  /** Folders collapsed in the file lists, as repository-relative paths. */
  readonly collapsedFolders: ReadonlySet<string>;
  /** Whether the commit's whole tree is listed instead of only what changed. */
  readonly showAllCommitFiles: boolean;
  /** Commit at the top of the history viewport, to return to it. */
  readonly historyAnchor: string | null;
  /** Whether the branch list stays open while a file is being read. */
  readonly sidebarPinned: boolean;
  /** Temporary visibility that belongs only to the currently open file. */
  readonly sidebarTemporaryOpen: boolean;
}

/** A project that has just been opened: history, nothing pending. */
export const EMPTY_NAVIGATION: Navigation = {
  selection: { kind: "history" },
  revealCommitId: null,
  expandedFilePath: null,
  searchQuery: "",
  collapsedFolders: new Set(),
  showAllCommitFiles: false,
  historyAnchor: null,
  sidebarPinned: false,
  sidebarTemporaryOpen: false,
};

/** A change to a project's navigation. Returns the same value when nothing changes. */
export type Transition = (navigation: Navigation) => Navigation;

/** Selects a commit, or returns to history when `id` is `null`. */
export function selectCommit(id: string | null): Transition {
  return (navigation) => {
    const { selection } = navigation;
    if (id === null) {
      return {
        ...navigation,
        selection: { kind: "history" },
        expandedFilePath: null,
        sidebarTemporaryOpen: false,
      };
    }
    if (selection.kind === "commit" && selection.commitId === id) {
      return navigation;
    }
    return {
      ...navigation,
      selection: { kind: "commit", commitId: id, filePath: null },
      expandedFilePath: null,
      sidebarTemporaryOpen: false,
    };
  };
}

/** Selects a file from a commit or local-change side; `null` clears the file selection. */
export function selectFile(
  path: string | null,
  source: FileSource = "commit",
  mode: "diff" | "snapshot" = "diff",
): Transition {
  return (navigation) => {
    const { selection } = navigation;
    if (path === null) {
      return selection.kind === "commit"
        ? {
            ...navigation,
            selection: {
              kind: "commit",
              commitId: selection.commitId,
              filePath: null,
            },
            expandedFilePath: null,
            sidebarTemporaryOpen: false,
          }
        : {
            ...navigation,
            selection: { kind: "history" },
            expandedFilePath: null,
            sidebarTemporaryOpen: false,
          };
    }

    if (source === "commit") {
      if (selection.kind !== "commit") {
        return {
          ...navigation,
          selection: { kind: "history" },
          expandedFilePath: null,
          sidebarTemporaryOpen: false,
        };
      }
      return {
        ...navigation,
        selection: {
          kind: "commit",
          commitId: selection.commitId,
          filePath: path,
          ...(mode === "snapshot" ? { fileMode: "snapshot" as const } : {}),
        },
        expandedFilePath: null,
        sidebarTemporaryOpen: false,
      };
    }

    return {
      ...navigation,
      selection: { kind: "worktree", side: source, filePath: path },
      expandedFilePath: null,
      sidebarTemporaryOpen: false,
    };
  };
}

/** Requests expanded content for a file that exceeded its initial read limit. */
export function expandFile(path: string): Transition {
  return (navigation) => ({ ...navigation, expandedFilePath: path });
}

/** Selects a commit and requests that the history view scroll it into view. */
export function revealCommit(id: string): Transition {
  return (navigation) => ({
    ...navigation,
    selection: { kind: "commit", commitId: id, filePath: null },
    expandedFilePath: null,
    revealCommitId: id,
    sidebarTemporaryOpen: false,
  });
}

/** Clears the pending scroll request after the history view handles it. */
export const clearReveal: Transition = (navigation) =>
  navigation.revealCommitId === null
    ? navigation
    : { ...navigation, revealCommitId: null };

/** Clears a reveal request but keeps the selected commit inspectable outside the filtered walk. */
export const clearOrphanedReveal: Transition = (navigation) => {
  const { revealCommitId } = navigation;
  if (revealCommitId === null) return navigation;
  return {
    ...navigation,
    revealCommitId: null,
  };
};

/** Records what was typed in the commit search. */
export function setSearchQuery(query: string): Transition {
  return (navigation) =>
    navigation.searchQuery === query
      ? navigation
      : { ...navigation, searchQuery: query };
}

/** Collapses a folder in the file lists, or expands it when it is collapsed. */
export function toggleFolder(path: string): Transition {
  return (navigation) => {
    const collapsedFolders = new Set(navigation.collapsedFolders);
    if (!collapsedFolders.delete(path)) collapsedFolders.add(path);
    return { ...navigation, collapsedFolders };
  };
}

/** Replaces the whole set of collapsed folders. */
export function setCollapsedFolders(paths: ReadonlySet<string>): Transition {
  return (navigation) => ({ ...navigation, collapsedFolders: new Set(paths) });
}

/** Chooses between listing what changed and the commit's whole tree. */
export function setShowAllCommitFiles(show: boolean): Transition {
  return (navigation) =>
    navigation.showAllCommitFiles === show
      ? navigation
      : { ...navigation, showAllCommitFiles: show };
}

/** Records the commit at the top of the history viewport. */
export function setHistoryAnchor(commitId: string | null): Transition {
  return (navigation) =>
    navigation.historyAnchor === commitId
      ? navigation
      : { ...navigation, historyAnchor: commitId };
}

/** Pins or unpins the branch list while a file is being read. */
export function setSidebarPinned(pinned: boolean): Transition {
  return (navigation) =>
    navigation.sidebarPinned === pinned
      ? navigation
      : { ...navigation, sidebarPinned: pinned };
}

/** Shows or hides the panel temporarily while the current file is open. */
export function setSidebarTemporaryOpen(open: boolean): Transition {
  return (navigation) =>
    navigation.sidebarTemporaryOpen === open
      ? navigation
      : { ...navigation, sidebarTemporaryOpen: open };
}

/**
 * Returns the selected commit id, or `null` when history itself is selected.
 *
 * @param navigation - A project's navigation.
 * @returns The commit id for a commit selection; otherwise `null`.
 */
export function selectedCommitId(navigation: Navigation): string | null {
  const { selection } = navigation;
  return selection.kind === "commit" && selection.commitId !== ""
    ? selection.commitId
    : null;
}

/**
 * Returns the selected file path across commit and worktree views.
 *
 * @param navigation - A project's navigation.
 * @returns The selected path, or `null` for history without a file.
 */
export function selectedFilePath(navigation: Navigation): string | null {
  const { selection } = navigation;
  return selection.kind === "history" ? null : selection.filePath;
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
