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

/**
 * Activates the tab `step` places from the active one, wrapping at the ends.
 * Home is the first stop of the row, before the first project.
 */
export function activateRelative(step: 1 | -1): void {
  const { tabs, activeRoot, homeOpen, activate, setHomeOpen } =
    useWorkspace.getState();
  if (tabs.length === 0) return;
  const stops = tabs.length + 1;
  const index = tabs.findIndex((tab) => tab.repository.path === activeRoot);
  const current = homeOpen ? 0 : index + 1;
  const next = (current + step + stops) % stops;
  const target = tabs[next - 1];
  if (target === undefined) setHomeOpen(true);
  else activate(target.repository.path);
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

/**
 * Closes the active tab, unless its project is being written to. Home is not a
 * project and cannot be closed, so with Home showing nothing happens.
 */
export function closeActiveTab(): CloseOutcome | null {
  const { activeRoot, homeOpen, closeTab } = useWorkspace.getState();
  return activeRoot === null || homeOpen ? null : closeTab(activeRoot);
}

/** Reopens the most recently closed tab, where it was left. */
export function reopenClosedTab(): ReopenOutcome {
  return useWorkspace.getState().reopenClosedTab();
}

/**
 * Closes every tab but the one named, which becomes the active one. A tab whose
 * project is being written to stays open, as it would on its own.
 */
export function closeOtherTabs(root: string): void {
  const { tabs, activate, closeTab } = useWorkspace.getState();
  if (!tabs.some((tab) => tab.repository.path === root)) return;
  activate(root);
  for (const tab of tabs) {
    if (tab.repository.path !== root) closeTab(tab.repository.path);
  }
}

/**
 * Closes the tabs after the one named, in tab order. The named tab becomes the
 * active one only if the active tab was among those closed.
 */
export function closeTabsAfter(root: string): void {
  const { tabs, activeRoot, activate, closeTab } = useWorkspace.getState();
  const index = tabs.findIndex((tab) => tab.repository.path === root);
  if (index < 0) return;
  const after = tabs.slice(index + 1);
  if (after.some((tab) => tab.repository.path === activeRoot)) activate(root);
  for (const tab of after) closeTab(tab.repository.path);
}
