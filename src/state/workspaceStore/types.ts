import type {
  GraphPreferences,
  ReferenceFilterPreferences,
  ReferenceTreePreferences,
  RepositoryInfo,
  Workspace,
  WorkspaceLimits,
} from "../../bindings";
import type { GitActionState, GitTransition } from "../gitActionState";
import type { Navigation, Transition } from "../navigation";
import type { Verification } from "../verification";

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
export type WorkspaceNotice =
  /** A bound was reached, so nothing was added. */
  | {
      readonly code: "tabLimit" | "favoriteLimit";
      readonly max: number;
    }
  /** The clipboard refused a project's path. */
  | { readonly code: "pathCopyFailed"; readonly path: string };

/** What reopening a closed tab did. */
export type ReopenOutcome =
  /** The tab is back, where it was left, and active. */
  | "reopened"
  /** The tab limit was reached, so the closed tab stays remembered. */
  | "limit"
  /** There was nothing to reopen. */
  | "none";

/** A project's tab as it was when closed: enough to put it back. */
export interface ClosedTab {
  readonly repository: RepositoryInfo;
  readonly navigation: Navigation;
}

/** The row of tabs and everything that happens to a tab. */
export interface TabsSlice {
  /** Open projects, in tab order. */
  readonly tabs: readonly Tab[];
  /** Canonical root of the active tab, or `null` when none is open. */
  readonly activeRoot: string | null;
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
  /** Replaces an unreachable tab with a validated root, reusing an existing tab. */
  relocate: (root: string, repository: RepositoryInfo) => void;
  /** Applies a navigation change to the project with this root, if it is open. */
  navigate: (root: string, transition: Transition) => void;
  /** Applies a change to the git action state of the project with this root. */
  updateGitActions: (root: string, transition: GitTransition) => void;
  /** Records the outcome of checking the project with this root. */
  setVerification: (root: string, verification: Verification) => void;
}

/** Tabs closed in this session, newest first, so the latest can be reopened. */
export interface ClosedTabsSlice {
  /** Bounded; never holds a project that is open again. */
  readonly closedTabs: readonly ClosedTab[];
  /** Reopens the most recently closed tab that is not open, where it was left. */
  reopenClosedTab: () => ReopenOutcome;
}

/** The projects worth coming back to: starred ones and the latest used. */
export interface LibrarySlice {
  readonly favorites: readonly string[];
  /** Most recently used first, bounded by the backend's limit. */
  readonly recents: readonly string[];
  /** Stars a project, or unstars it; refuses past the limit with a notice. */
  toggleFavorite: (root: string) => void;
  removeRecent: (root: string) => void;
}

/** Which full-window view replaces the open project, if any. */
export interface ViewSlice {
  /**
   * Whether the home screen (open, clone, favorites, recents) is showing in
   * place of the project. It is the first tab of the row, never a project:
   * showing it changes no project's state and it is not saved.
   */
  readonly homeOpen: boolean;
  /**
   * Whether the clone-from-GitHub view is showing. It belongs to the
   * application, not to a tab: opening it changes no project's state.
   */
  readonly githubOpen: boolean;
  /** Shows or leaves the home screen. */
  setHomeOpen: (open: boolean) => void;
  /** Shows or hides the clone-from-GitHub view. */
  setGitHubOpen: (open: boolean) => void;
}

/** What went wrong keeping the workspace on disk, and restoring it. */
export interface StorageSlice {
  readonly storageError: {
    readonly cause: unknown;
    readonly kind: "save" | "recovery";
  } | null;
  /** Restores validated records without opening or authorizing their folders. */
  restore: (workspace: Workspace) => void;
  dismissStorageError: () => void;
  /** Reports a persistence failure while keeping the in-memory workspace usable. */
  setStorageError: (cause: unknown, kind?: "save" | "recovery") => void;
}

/** The backend's bounds, and the notices that cite them. */
export interface BoundsSlice {
  /** The bounds the backend enforces; `null` until they are read at startup. */
  readonly limits: WorkspaceLimits | null;
  /** The last thing worth telling the person, until they dismiss it. */
  readonly notice: WorkspaceNotice | null;
  /** Records the backend's bounds. */
  setLimits: (limits: WorkspaceLimits) => void;
  /** Tells the person something, replacing whatever was there. */
  notify: (notice: WorkspaceNotice) => void;
  /** Dismisses the current notice. */
  dismissNotice: () => void;
}

/** Durable graph preferences are independent of open tabs. */
export interface GraphSlice {
  readonly graphPreferences: readonly GraphPreferences[];
  setGraphPreferences: (preferences: GraphPreferences) => void;
  /** Migrates validated worktree-local graph preferences to repository scope. */
  migrateRepositoryPreferences: (input: {
    readonly repositoryId: string;
    readonly mainRoot: string | null;
    readonly activeRoot: string;
    readonly memberRoots: readonly string[];
    readonly automatic: GraphPreferences;
    readonly resolved: GraphPreferences;
  }) => void;
}

/** Durable reference exclusions, one record per canonical worktree root. */
export interface ReferenceFilterSlice {
  readonly referenceFilters: readonly ReferenceFilterPreferences[];
  readonly referenceFilterUndo: Readonly<
    Record<string, readonly (readonly string[])[]>
  >;
  readonly referenceSearches: Readonly<Record<string, string>>;
  setReferenceFilters: (preferences: ReferenceFilterPreferences) => void;
  changeReferenceFilters: (path: string, excluded: readonly string[]) => void;
  undoReferenceFilters: (path: string) => void;
  setReferenceSearch: (path: string, query: string) => void;
  clearReferenceSearch: (path: string) => void;
}

/** Durable reference-tree expansion, scoped to each canonical worktree root. */
export interface ReferenceTreeSlice {
  readonly referenceTreePreferences: readonly ReferenceTreePreferences[];
  setReferenceTreeCollapsed: (
    path: string,
    collapsed: readonly string[],
  ) => void;
}

/** The whole workspace: every slice, in one store. */
export type WorkspaceState = GraphSlice &
  ReferenceFilterSlice &
  ReferenceTreeSlice &
  TabsSlice &
  ClosedTabsSlice &
  LibrarySlice &
  ViewSlice &
  StorageSlice &
  BoundsSlice;
