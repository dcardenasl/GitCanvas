import { createGraphSlice } from "./workspaceStore/graphSlice";
import { createReferenceFilterSlice } from "./workspaceStore/referenceFilterSlice";
import { createReferenceTreeSlice } from "./workspaceStore/referenceTreeSlice";
import { useMemo } from "react";
import { create } from "zustand";

import type { RepositoryInfo } from "../bindings";
import type { GitActionState } from "./gitActionState";
import {
  clearOrphanedReveal,
  clearReveal,
  EMPTY_NAVIGATION,
  expandFile,
  revealCommit,
  selectCommit,
  selectFile,
  setCollapsedFolders,
  setHistoryAnchor,
  setSearchQuery,
  setShowAllCommitFiles,
  setSidebarPinned,
  setSidebarTemporaryOpen,
  toggleFolder,
  type FileSource,
  type Navigation,
  type Transition,
} from "./navigation";
import { createBoundsSlice } from "./workspaceStore/boundsSlice";
import { createClosedTabsSlice } from "./workspaceStore/closedTabsSlice";
import { createLibrarySlice } from "./workspaceStore/librarySlice";
import { createStorageSlice } from "./workspaceStore/storageSlice";
import { tabOf } from "./workspaceStore/tabRow";
import { createTabsSlice } from "./workspaceStore/tabsSlice";
import type { Tab, WorkspaceState } from "./workspaceStore/types";
import { createViewSlice } from "./workspaceStore/viewSlice";

export { tabOf } from "./workspaceStore/tabRow";
export type {
  CloseOutcome,
  OpenOutcome,
  ReopenOutcome,
  Tab,
  WorkspaceNotice,
} from "./workspaceStore/types";

/**
 * The open projects, which one is active, and what surrounds them.
 *
 * One store, built from slices that each own a responsibility — the row of
 * tabs, the favorites and recents, the full-window views, what went wrong on
 * disk, and the backend's bounds — so that one concern can be read, changed
 * and tested without the others. They share a single state because using a
 * project touches several at once, and those updates must land together.
 */
export const useWorkspace = create<WorkspaceState>()((...slice) => ({
  ...createGraphSlice(...slice),
  ...createReferenceFilterSlice(...slice),
  ...createReferenceTreeSlice(...slice),
  ...createTabsSlice(...slice),
  ...createClosedTabsSlice(...slice),
  ...createLibrarySlice(...slice),
  ...createViewSlice(...slice),
  ...createStorageSlice(...slice),
  ...createBoundsSlice(...slice),
}));

/** The active tab, or `null` when no project is open. */
function activeTab(state: WorkspaceState): Tab | null {
  return (
    state.tabs.find((tab) => tab.repository.path === state.activeRoot) ?? null
  );
}

/** The project shown now, or `null` when none is open. */
export function useActiveRepository(): RepositoryInfo | null {
  return useWorkspace((state) => activeTab(state)?.repository ?? null);
}

/** Reads from the active project's navigation; an empty one when none is open. */
export function useNavigation<T>(select: (navigation: Navigation) => T): T {
  return useWorkspace((state) =>
    select(activeTab(state)?.navigation ?? EMPTY_NAVIGATION),
  );
}

/** Changes to one project's navigation, bound to that project. */
export interface NavigationActions {
  readonly selectCommit: (id: string | null) => void;
  readonly selectFile: (
    path: string | null,
    source?: FileSource,
    mode?: "diff" | "snapshot",
  ) => void;
  readonly expandFile: (path: string) => void;
  readonly revealCommit: (id: string) => void;
  readonly clearReveal: () => void;
  readonly clearOrphanedReveal: () => void;
  readonly setSearchQuery: (query: string) => void;
  readonly toggleFolder: (path: string) => void;
  readonly setCollapsedFolders: (paths: ReadonlySet<string>) => void;
  readonly setShowAllCommitFiles: (show: boolean) => void;
  readonly setHistoryAnchor: (commitId: string | null) => void;
  readonly setSidebarPinned: (pinned: boolean) => void;
  readonly setSidebarTemporaryOpen: (open: boolean) => void;
}

/**
 * The navigation changes for the project with `root`.
 *
 * Bound to the root, not to "whichever tab is active when it runs": a change
 * started from one project's view lands on that project even if the person has
 * moved on by the time it fires.
 */
export function navigationActionsFor(root: string | null): NavigationActions {
  const apply = (transition: Transition) => {
    if (root !== null) useWorkspace.getState().navigate(root, transition);
  };
  return {
    selectCommit: (id) => {
      apply(selectCommit(id));
    },
    selectFile: (path, source, mode) => {
      apply(selectFile(path, source, mode));
    },
    expandFile: (path) => {
      apply(expandFile(path));
    },
    revealCommit: (id) => {
      apply(revealCommit(id));
    },
    clearReveal: () => {
      apply(clearReveal);
    },
    clearOrphanedReveal: () => {
      apply(clearOrphanedReveal);
    },
    setSearchQuery: (query) => {
      apply(setSearchQuery(query));
    },
    toggleFolder: (path) => {
      apply(toggleFolder(path));
    },
    setCollapsedFolders: (paths) => {
      apply(setCollapsedFolders(paths));
    },
    setShowAllCommitFiles: (show) => {
      apply(setShowAllCommitFiles(show));
    },
    setHistoryAnchor: (commitId) => {
      apply(setHistoryAnchor(commitId));
    },
    setSidebarPinned: (pinned) => {
      apply(setSidebarPinned(pinned));
    },
    setSidebarTemporaryOpen: (open) => {
      apply(setSidebarTemporaryOpen(open));
    },
  };
}

/** Navigation changes bound to the project this view is showing. */
export function useNavigationActions(): NavigationActions {
  const root = useWorkspace((state) => state.activeRoot);
  return useMemo(() => navigationActionsFor(root), [root]);
}

/**
 * The git action state of the project with `root`, or `null` when it is not
 * open. A plain function of the state so a selector and a one-off read share it.
 */
export function gitActionsOf(
  state: Pick<WorkspaceState, "tabs">,
  root: string,
): GitActionState | null {
  return tabOf(state, root)?.gitActions ?? null;
}
