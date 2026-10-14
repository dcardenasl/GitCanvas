import { UNVERIFIED } from "../verification";
import type { Tab, WorkspaceState } from "./types";

/**
 * Applies `change` to the tab with `root`. Returns the state itself, unchanged,
 * when the project is not open or the change leaves its tab as it was, so
 * subscribers are not woken for nothing.
 */
export function changeTab(
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
export function neighborOf(
  tabs: readonly Tab[],
  closing: string,
): string | null {
  const index = tabs.findIndex((tab) => tab.repository.path === closing);
  const next = tabs[index + 1] ?? tabs[index - 1];
  return next?.repository.path ?? null;
}

/** Gates an activation synchronously, before effects or a stale callback can write. */
export function prepareActivation(
  tabs: readonly Tab[],
  root: string | null,
  previous: string | null,
  reopened = false,
): readonly Tab[] {
  return tabs.map((tab) => {
    if (tab.repository.path !== root || tab.verification.status === "verifying")
      return tab;
    if (
      root === previous &&
      !(reopened && tab.verification.status === "unreachable")
    )
      return tab;
    return tab.verification.status === "unverified"
      ? tab
      : { ...tab, verification: UNVERIFIED };
  });
}

/** The tab for the project with `root`, or `null` when it is not open. */
export function tabOf(
  state: Pick<WorkspaceState, "tabs">,
  root: string,
): Tab | null {
  return state.tabs.find((tab) => tab.repository.path === root) ?? null;
}
