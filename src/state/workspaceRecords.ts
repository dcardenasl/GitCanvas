import type {
  GraphPreferences,
  ReferenceFilterPreferences,
  ReferenceTreePreferences,
  SavedSelection,
  TabRecord,
  Workspace,
} from "../bindings";
import { projectName } from "./projectNames";
import { IDLE_GIT_ACTIONS } from "./gitActionState";
import { EMPTY_NAVIGATION, type Selection } from "./navigation";
import { UNVERIFIED } from "./verification";
import type { Tab } from "./workspace";

function saveSelection(selection: Selection): SavedSelection {
  switch (selection.kind) {
    case "history":
      return { kind: "history" };
    case "commit":
      return {
        kind: "commit",
        commit_id: selection.commitId,
        file_path: selection.filePath,
        snapshot: selection.fileMode === "snapshot",
      };
    case "worktree":
      return {
        kind: "worktree",
        side: selection.side,
        file_path: selection.filePath,
      };
  }
}

function restoreSelection(selection: SavedSelection): Selection {
  switch (selection.kind) {
    case "history":
      return { kind: "history" };
    case "commit":
      return {
        kind: "commit",
        commitId: selection.commit_id,
        filePath: selection.file_path,
        ...(selection.snapshot ? { fileMode: "snapshot" as const } : {}),
      };
    case "worktree":
      return {
        kind: "worktree",
        side: selection.side,
        filePath: selection.file_path,
      };
  }
}

/** Restores presentation data only; a saved root grants no repository access. */
export function restoreTab(record: TabRecord): Tab {
  return {
    repository: {
      path: record.path,
      name: projectName(record.path),
    },
    navigation: {
      ...EMPTY_NAVIGATION,
      selection: restoreSelection(record.selection),
      historyAnchor: record.history_anchor,
      collapsedFolders: new Set(record.collapsed_folders),
    },
    gitActions: IDLE_GIT_ACTIONS,
    verification: UNVERIFIED,
  };
}

/** The durable projection; caches, pending work and transient view state stay out. */
export function workspaceRecord(state: {
  readonly tabs: readonly Tab[];
  readonly activeRoot: string | null;
  readonly favorites: readonly string[];
  readonly recents: readonly string[];
  readonly graphPreferences: readonly GraphPreferences[];
  readonly referenceFilters: readonly ReferenceFilterPreferences[];
  readonly referenceTreePreferences: readonly ReferenceTreePreferences[];
}): Workspace {
  return {
    tabs: state.tabs.map(({ repository, navigation }) => ({
      path: repository.path,
      selection: saveSelection(navigation.selection),
      history_anchor: navigation.historyAnchor,
      collapsed_folders: [...navigation.collapsedFolders],
    })),
    active: state.activeRoot,
    favorites: [...state.favorites],
    recents: [...state.recents],
    graph_preferences: [...state.graphPreferences],
    reference_filters: [...state.referenceFilters],
    reference_tree_preferences: [...state.referenceTreePreferences],
  };
}
