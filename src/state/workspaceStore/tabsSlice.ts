import type { StateCreator } from "zustand";

import { IDLE_GIT_ACTIONS } from "../gitActionState";
import { EMPTY_NAVIGATION } from "../navigation";
import { VERIFIED } from "../verification";
import { recentsAfterVisit } from "./librarySlice";
import { changeTab, neighborOf, prepareActivation } from "./tabRow";
import type { Tab, TabsSlice, WorkspaceState } from "./types";
import { NO_FULL_VIEW } from "./viewSlice";

/** A project that was just opened: the open itself was the check. */
function freshTab(repository: Tab["repository"]): Tab {
  return {
    repository,
    navigation: EMPTY_NAVIGATION,
    gitActions: IDLE_GIT_ACTIONS,
    verification: VERIFIED,
  };
}

/**
 * Each tab owns its own navigation, so changing tabs neither resets nor shares
 * what is selected. Every change names the project it applies to; the hooks in
 * `workspace.ts` bind a view's changes to the project it rendered, so a late
 * callback from a tab that has since gone to the background cannot alter another.
 *
 * Using a project — opening or activating it — also moves it to the front of the
 * recents and returns to the project from any full-window view, in the same
 * update, so nothing ever observes one without the other.
 */
export const createTabsSlice: StateCreator<
  WorkspaceState,
  [],
  [],
  TabsSlice
> = (set, get) => ({
  tabs: [],
  activeRoot: null,

  openProject: (repository) => {
    const state = get();
    if (state.limits === null) {
      throw new Error("Workspace limits are not loaded");
    }
    const root = repository.path;
    if (state.tabs.some((tab) => tab.repository.path === root)) {
      set({
        tabs: prepareActivation(state.tabs, root, state.activeRoot, true),
        activeRoot: root,
        recents: recentsAfterVisit(state, root),
        notice: null,
        ...NO_FULL_VIEW,
      });
      return "activated";
    }
    if (state.tabs.length >= state.limits.max_tabs) {
      set({ notice: { code: "tabLimit", max: state.limits.max_tabs } });
      return "limit";
    }
    set({
      tabs: [...state.tabs, freshTab(repository)],
      activeRoot: root,
      recents: recentsAfterVisit(state, root),
      notice: null,
      ...NO_FULL_VIEW,
    });
    return "opened";
  },

  activate: (root) => {
    const state = get();
    if (!state.tabs.some((tab) => tab.repository.path === root)) return;
    set({
      tabs: prepareActivation(state.tabs, root, state.activeRoot),
      activeRoot: root,
      recents: recentsAfterVisit(state, root),
      ...NO_FULL_VIEW,
    });
  },

  closeTab: (root) => {
    const { tabs, activeRoot } = get();
    const tab = tabs.find((candidate) => candidate.repository.path === root);
    if (tab === undefined) return "closed";
    if (tab.gitActions.running !== null) return "busy";
    const next = activeRoot === root ? neighborOf(tabs, root) : activeRoot;
    set({
      tabs: prepareActivation(
        tabs.filter((candidate) => candidate !== tab),
        next,
        activeRoot,
      ),
      activeRoot: next,
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

  relocate: (root, repository) => {
    const { tabs, activeRoot } = get();
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
      tabs: prepareActivation(
        existing !== undefined && existing !== source
          ? tabs.filter((tab) => tab !== source)
          : tabs.map((tab) => (tab === source ? freshTab(repository) : tab)),
        repository.path,
        activeRoot,
      ),
      activeRoot: repository.path,
    });
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
});
