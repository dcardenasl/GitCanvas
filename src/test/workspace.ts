import type { RepositoryInfo } from "../bindings";
import type { Navigation } from "../state/navigation";
import {
  navigationActionsFor,
  useWorkspace,
  type NavigationActions,
} from "../state/workspace";

/** The bounds a running backend would report. */
export const TEST_LIMITS = {
  max_tabs: 30,
  max_favorites: 200,
  max_recents: 20,
} as const;

/** The project tests open when they do not care which one it is. */
export const TEST_REPOSITORY: RepositoryInfo = {
  path: "/tmp/repo",
  name: "repo",
};

/** Closes every tab and gives the workspace the bounds the backend reports. */
export function resetWorkspace(): void {
  useWorkspace.setState({
    tabs: [],
    activeRoot: null,
    limits: TEST_LIMITS,
    notice: null,
    githubOpen: false,
    libraryView: null,
    favorites: [],
    recents: [],
    storageError: null,
  });
}

/** Opens a project the way the application does, and returns it. */
export function openTestProject(
  repository: RepositoryInfo = TEST_REPOSITORY,
): RepositoryInfo {
  useWorkspace.getState().openProject(repository);
  return repository;
}

/** The root of the active tab, or `null` when none is open. */
export function activeRoot(): string | null {
  return useWorkspace.getState().activeRoot;
}

/** The project shown now, or `null` when none is open. */
export function activeRepository(): RepositoryInfo | null {
  const { tabs, activeRoot: root } = useWorkspace.getState();
  return tabs.find((tab) => tab.repository.path === root)?.repository ?? null;
}

/** The active tab's navigation. Fails when no project is open. */
export function activeNavigation(): Navigation {
  const { tabs, activeRoot: root } = useWorkspace.getState();
  const tab = tabs.find((candidate) => candidate.repository.path === root);
  if (tab === undefined) throw new Error("No project is open in this test");
  return tab.navigation;
}

/** Navigation changes bound to the active tab. */
export function navigationActions(): NavigationActions {
  return navigationActionsFor(activeRoot());
}

/**
 * Sets parts of the active tab's navigation directly, opening the default test
 * project first when nothing is open.
 */
export function patchNavigation(patch: Partial<Navigation>): void {
  if (activeRoot() === null) openTestProject();
  const root = activeRoot();
  if (root === null) throw new Error("No project is open in this test");
  useWorkspace
    .getState()
    .navigate(root, (navigation) => ({ ...navigation, ...patch }));
}
