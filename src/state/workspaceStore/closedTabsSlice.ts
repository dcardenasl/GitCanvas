import type { StateCreator } from "zustand";

import { IDLE_GIT_ACTIONS } from "../gitActionState";
import { UNVERIFIED } from "../verification";
import { recentsAfterVisit } from "./librarySlice";
import { prepareActivation } from "./tabRow";
import type { ClosedTab, ClosedTabsSlice, Tab, WorkspaceState } from "./types";
import { NO_FULL_VIEW } from "./viewSlice";

/** How many closed tabs are remembered; older ones are forgotten. */
export const MAX_CLOSED_TABS = 10;

/**
 * The closed tabs after `tab` was closed: it goes first, once, and the list
 * keeps to its bound. Pure, so closing a tab can fold it into its own update.
 */
export function closedTabsAfterClosing(
  closed: readonly ClosedTab[],
  tab: Tab,
): readonly ClosedTab[] {
  const { repository, navigation } = tab;
  return [
    { repository, navigation },
    ...closed.filter((entry) => entry.repository.path !== repository.path),
  ].slice(0, MAX_CLOSED_TABS);
}

/** Reopening what was closed, in the order it was closed. */
export const createClosedTabsSlice: StateCreator<
  WorkspaceState,
  [],
  [],
  ClosedTabsSlice
> = (set, get) => ({
  closedTabs: [],

  /**
   * Puts back the newest closed tab whose project is not open. One that is
   * open again — reopened from the library, say — is dropped from the list,
   * since there is nothing left to reopen. The tab returns with its selection,
   * search and folders, and unverified: the folder may have changed since.
   */
  reopenClosedTab: () => {
    const state = get();
    const open = new Set(state.tabs.map((tab) => tab.repository.path));
    const candidates = state.closedTabs.filter(
      (entry) => !open.has(entry.repository.path),
    );
    const [next, ...rest] = candidates;
    if (next === undefined) {
      if (candidates.length !== state.closedTabs.length) {
        set({ closedTabs: candidates });
      }
      return "none";
    }
    if (state.limits !== null && state.tabs.length >= state.limits.max_tabs) {
      set({ notice: { code: "tabLimit", max: state.limits.max_tabs } });
      return "limit";
    }
    const root = next.repository.path;
    set({
      tabs: prepareActivation(
        [
          ...state.tabs,
          {
            repository: next.repository,
            navigation: next.navigation,
            gitActions: IDLE_GIT_ACTIONS,
            verification: UNVERIFIED,
          },
        ],
        root,
        state.activeRoot,
      ),
      activeRoot: root,
      closedTabs: rest,
      recents: recentsAfterVisit(state, root),
      notice: null,
      ...NO_FULL_VIEW,
    });
    return "reopened";
  },
});
