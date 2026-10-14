import { useMemo } from "react";
import { create } from "zustand";

import type { RepositoryInfo, Workspace, WorkspaceLimits } from "../bindings";
import {
  IDLE_GIT_ACTIONS,
  type GitActionState,
  type GitTransition,
} from "./gitActionState";
import { restoreTab } from "./workspaceRecords";
import { VERIFIED, type Verification } from "./verification";
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
  toggleFolder,
  type FileSource,
  type Navigation,
  type Transition,
} from "./navigation";

/** One open project: its identity and where its view was left. */
export interface Tab {
  /** The project; its canonical working-tree root identifies the tab. */
  readonly repository: RepositoryInfo;
  /** Selection, reveal and expansion, kept while the tab is in the background. */
  readonly navigation: Navigation;
  /** Checkout, pull and push for this project, whichever tab is showing. */
  readonly gitActions: GitActionState;
  /** Whether the folder has been checked since it was last on screen. */
  readonly verification: Verification;
}

/** What opening a project did. */
export type OpenOutcome =
  /** A new tab was added and activated. */
  | "opened"
  /** The project was already open, so its tab was activated. */
  | "activated"
  /** The tab limit was reached, so nothing was opened. */
  | "limit";

/** What closing a tab did. */
export type CloseOutcome =
  /** The tab is gone, or was never open. */
  | "closed"
  /** An action is still writing to the project, so the tab stays. */
  | "busy";

/** Something the interface owes the person after a workspace action. */
export interface WorkspaceNotice {
  readonly code: "tabLimit" | "favoriteLimit";
  readonly max: number;
}

interface WorkspaceState {
  /** Open projects, in tab order. */
  readonly tabs: readonly Tab[];
  /** Canonical root of the active tab, or `null` when none is open. */
  readonly activeRoot: string | null;
  /** The bounds the backend enforces; `null` until they are read at startup. */
  readonly limits: WorkspaceLimits | null;
  readonly libraryView: "favorites" | "recents" | null;
  setLibraryView: (view: "favorites" | "recents" | null) => void;
  toggleFavorite: (root: string) => void;
  removeRecent: (root: string) => void;
  readonly favorites: readonly string[];
  readonly recents: readonly string[];
  readonly storageError: {
    readonly cause: unknown;
    readonly kind: "save" | "recovery";
  } | null;
  /** Restores validated records without opening or authorizing their folders. */
  restore: (workspace: Workspace) => void;
  dismissStorageError: () => void;
  /** Reports a persistence failure while keeping the in-memory workspace usable. */
  setStorageError: (cause: unknown, kind?: "save" | "recovery") => void;
  /** Replaces an unreachable tab with a validated root, reusing an existing tab. */
  relocate: (root: string, repository: RepositoryInfo) => void;
  /** The last thing worth telling the person, until they dismiss it. */
  readonly notice: WorkspaceNotice | null;
  /**
   * Whether the clone-from-GitHub view is showing. It belongs to the
   * application, not to a tab: opening it changes no project's state.
   */
  readonly githubOpen: boolean;
  /** Records the backend's bounds. */
  setLimits: (limits: WorkspaceLimits) => void;
  /** Opens a project in a new tab, or activates its tab when already open. */
  openProject: (repository: RepositoryInfo) => OpenOutcome;
  /** Makes an open project's tab the active one. */
  activate: (root: string) => void;
  /**
   * Closes a tab; if it was active, its neighbor takes over. A tab whose
   * project is being written to cannot be closed: the write would go on with
   * nothing left to report it.
   */
  closeTab: (root: string) => CloseOutcome;
  /** Moves a tab to a position in the row; the active tab does not change. */
  moveTab: (root: string, index: number) => void;
  /** Applies a navigation change to the project with this root, if it is open. */
  navigate: (root: string, transition: Transition) => void;
  /** Applies a change to the git action state of the project with this root. */
  updateGitActions: (root: string, transition: GitTransition) => void;
  /** Records the outcome of checking the project with this root. */
  setVerification: (root: string, verification: Verification) => void;
  /** Dismisses the current notice. */
  dismissNotice: () => void;
  /** Shows or hides the clone-from-GitHub view. */
  setGitHubOpen: (open: boolean) => void;
}

/**
 * Applies `change` to the tab with `root`. Returns the state itself, unchanged,
 * when the project is not open or the change leaves its tab as it was, so
 * subscribers are not woken for nothing.
 */
function changeTab(
  state: WorkspaceState,
  root: string,
  change: (tab: Tab) => Tab,
): WorkspaceState | Pick<WorkspaceState, "tabs"> {
  const index = state.tabs.findIndex((tab) => tab.repository.path === root);
  const tab = state.tabs[index];
  if (tab === undefined) return state;
  const changed = change(tab);
  if (changed === tab) return state;
  return {
    tabs: state.tabs.map((candidate, position) =>
      position === index ? changed : candidate,
    ),
  };
}

/** The tab to activate when `closing` goes away: the next one, else the previous. */
function neighborOf(tabs: readonly Tab[], closing: string): string | null {
  const index = tabs.findIndex((tab) => tab.repository.path === closing);
  const next = tabs[index + 1] ?? tabs[index - 1];
  return next?.repository.path ?? null;
}

/**
 * The open projects and which one is active.
 *
 * Each tab owns its own navigation, so changing tabs neither resets nor shares
 * what is selected. Every change names the project it applies to; the hooks
 * below bind a view's changes to the project it rendered, so a late callback
 * from a tab that has since gone to the background cannot alter another one.
 */
export const useWorkspace = create<WorkspaceState>((set, get) => ({
  tabs: [],
  activeRoot: null,
  limits: null,
  notice: null,
  githubOpen: false,
  favorites: [],
  recents: [],
  libraryView: null,
  setLibraryView: (libraryView) => {
    set({ libraryView, githubOpen: false });
  },
  toggleFavorite: (root) => {
    const { favorites, limits } = get();
    if (favorites.includes(root)) {
      set({ favorites: favorites.filter((path) => path !== root) });
      return;
    }
    if (limits === null) throw new Error("Workspace limits are not loaded");
    if (favorites.length >= limits.max_favorites) {
      set({ notice: { code: "favoriteLimit", max: limits.max_favorites } });
      return;
    }
    set({ favorites: [...favorites, root] });
  },
  removeRecent: (root) => {
    set({ recents: get().recents.filter((path) => path !== root) });
  },
  storageError: null,

  restore: (workspace) => {
    set({
      tabs: workspace.tabs.map(restoreTab),
      activeRoot: workspace.active ?? workspace.tabs[0]?.path ?? null,
      favorites: workspace.favorites,
      recents: workspace.recents,
    });
  },

  setStorageError: (cause, kind = "save") => {
    if (cause === null && get().storageError?.kind === "recovery") return;
    set({ storageError: cause === null ? null : { cause, kind } });
  },

  dismissStorageError: () => {
    set({ storageError: null });
  },

  relocate: (root, repository) => {
    const { tabs } = get();
    const source = tabs.find((tab) => tab.repository.path === root);
    if (
      source?.verification.status !== "unreachable" ||
      source.gitActions.running !== null
    )
      return;
    const existing = tabs.find(
      (tab) => tab.repository.path === repository.path,
    );
    set({
      tabs:
        existing !== undefined && existing !== source
          ? tabs.filter((tab) => tab !== source)
          : tabs.map((tab) =>
              tab === source
                ? {
                    repository,
                    navigation: EMPTY_NAVIGATION,
                    gitActions: IDLE_GIT_ACTIONS,
                    verification: VERIFIED,
                  }
                : tab,
            ),
      activeRoot: repository.path,
    });
  },

  setLimits: (limits) => {
    set({ limits });
  },

  openProject: (repository) => {
    const { tabs, limits, recents } = get();
    if (limits === null) {
      throw new Error("Workspace limits are not loaded");
    }
    const root = repository.path;
    if (tabs.some((tab) => tab.repository.path === root)) {
      set({
        activeRoot: root,
        notice: null,
        githubOpen: false,
        recents: [root, ...recents.filter((path) => path !== root)].slice(
          0,
          limits.max_recents,
        ),
        libraryView: null,
      });
      return "activated";
    }
    if (tabs.length >= limits.max_tabs) {
      set({ notice: { code: "tabLimit", max: limits.max_tabs } });
      return "limit";
    }
    set({
      tabs: [
        ...tabs,
        {
          repository,
          navigation: EMPTY_NAVIGATION,
          gitActions: IDLE_GIT_ACTIONS,
          verification: VERIFIED,
        },
      ],
      activeRoot: root,
      recents: [root, ...recents.filter((path) => path !== root)].slice(
        0,
        limits.max_recents,
      ),
      libraryView: null,
      githubOpen: false,
      notice: null,
    });
    return "opened";
  },

  activate: (root) => {
    const { tabs } = get();
    if (tabs.some((tab) => tab.repository.path === root)) {
      const { recents, limits } = get();
      set({
        activeRoot: root,
        libraryView: null,
        githubOpen: false,
        recents: [root, ...recents.filter((path) => path !== root)].slice(
          0,
          limits?.max_recents ?? 0,
        ),
      });
    }
  },

  closeTab: (root) => {
    const { tabs, activeRoot } = get();
    const tab = tabs.find((candidate) => candidate.repository.path === root);
    if (tab === undefined) return "closed";
    if (tab.gitActions.running !== null) return "busy";
    set({
      tabs: tabs.filter((candidate) => candidate !== tab),
      activeRoot: activeRoot === root ? neighborOf(tabs, root) : activeRoot,
    });
    return "closed";
  },

  moveTab: (root, index) => {
    const { tabs } = get();
    const from = tabs.findIndex((tab) => tab.repository.path === root);
    const to = Math.max(0, Math.min(index, tabs.length - 1));
    const moving = tabs[from];
    if (moving === undefined || from === to) return;
    const rest = tabs.filter((_, position) => position !== from);
    set({ tabs: [...rest.slice(0, to), moving, ...rest.slice(to)] });
  },

  navigate: (root, transition) => {
    set((state) =>
      changeTab(state, root, (tab) => {
        const navigation = transition(tab.navigation);
        return navigation === tab.navigation ? tab : { ...tab, navigation };
      }),
    );
  },

  updateGitActions: (root, transition) => {
    set((state) =>
      changeTab(state, root, (tab) => {
        const gitActions = transition(tab.gitActions);
        return gitActions === tab.gitActions ? tab : { ...tab, gitActions };
      }),
    );
  },

  setVerification: (root, verification) => {
    set((state) => changeTab(state, root, (tab) => ({ ...tab, verification })));
  },

  dismissNotice: () => {
    set({ notice: null });
  },

  setGitHubOpen: (githubOpen) => {
    set({ githubOpen, ...(githubOpen ? { libraryView: null } : {}) });
  },
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

/** The tab for the project with `root`, or `null` when it is not open. */
export function tabOf(
  state: Pick<WorkspaceState, "tabs">,
  root: string,
): Tab | null {
  return state.tabs.find((tab) => tab.repository.path === root) ?? null;
}
