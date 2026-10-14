import {
  useWorkspace,
  type CloseOutcome,
  type ReopenOutcome,
} from "./workspace";

/**
 * What can be asked of the row of tabs, from anywhere: the keyboard, the native
 * menu, the tab bar itself. One definition, so they cannot disagree about what
 * "next tab" or "tab 9" means.
 */

/** Activates the tab `step` places from the active one, wrapping at the ends. */
export function activateRelative(step: 1 | -1): void {
  const { tabs, activeRoot, activate } = useWorkspace.getState();
  if (tabs.length < 2) return;
  const current = tabs.findIndex((tab) => tab.repository.path === activeRoot);
  const next = tabs[(Math.max(current, 0) + step + tabs.length) % tabs.length];
  if (next !== undefined) activate(next.repository.path);
}

/**
 * Activates the `position`th tab, counting from 1. Position 9 means the last
 * tab however many there are, as in browsers; a position past the row does
 * nothing.
 */
export function activatePosition(position: number): void {
  const { tabs, activate } = useWorkspace.getState();
  const target = position === 9 ? tabs.at(-1) : tabs[Math.max(position - 1, 0)];
  if (target !== undefined) activate(target.repository.path);
}

/** Closes the active tab, unless its project is being written to. */
export function closeActiveTab(): CloseOutcome | null {
  const { activeRoot, closeTab } = useWorkspace.getState();
  return activeRoot === null ? null : closeTab(activeRoot);
}

/** Reopens the most recently closed tab, where it was left. */
export function reopenClosedTab(): ReopenOutcome {
  return useWorkspace.getState().reopenClosedTab();
}
