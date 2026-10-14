// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import {
  activeNavigation,
  activeRepository,
  activeRoot,
  openTestProject,
  resetWorkspace,
  TEST_LIMITS,
} from "../test/workspace";
import {
  navigationActionsFor,
  useActiveRepository,
  useNavigation,
  useNavigationActions,
  useWorkspace,
} from "./workspace";

const COMMIT = "a".repeat(40);
const alpha = { path: "/projects/alpha", name: "alpha" };
const beta = { path: "/projects/beta", name: "beta" };
const gamma = { path: "/projects/gamma", name: "gamma" };

beforeEach(resetWorkspace);

function roots(): string[] {
  return useWorkspace.getState().tabs.map((tab) => tab.repository.path);
}

describe("opening projects", () => {
  it("adds a tab at the end and activates it", () => {
    expect(useWorkspace.getState().openProject(alpha)).toBe("opened");
    expect(useWorkspace.getState().openProject(beta)).toBe("opened");

    expect(roots()).toEqual([alpha.path, beta.path]);
    expect(activeRoot()).toBe(beta.path);
  });

  it("activates the tab of a project that is already open instead of repeating it", () => {
    openTestProject(alpha);
    openTestProject(beta);

    expect(useWorkspace.getState().openProject(alpha)).toBe("activated");

    expect(roots()).toEqual([alpha.path, beta.path]);
    expect(activeRoot()).toBe(alpha.path);
  });

  it("refuses to open past the limit and says so, leaving the tabs as they were", () => {
    useWorkspace.setState({ limits: { ...TEST_LIMITS, max_tabs: 2 } });
    openTestProject(alpha);
    openTestProject(beta);

    expect(useWorkspace.getState().openProject(gamma)).toBe("limit");

    expect(roots()).toEqual([alpha.path, beta.path]);
    expect(activeRoot()).toBe(beta.path);
    expect(useWorkspace.getState().notice).toEqual({
      code: "tabLimit",
      max: 2,
    });
  });

  it("still activates an open project when the limit is reached", () => {
    useWorkspace.setState({ limits: { ...TEST_LIMITS, max_tabs: 1 } });
    openTestProject(alpha);

    expect(useWorkspace.getState().openProject(alpha)).toBe("activated");
  });

  it("clears the notice once something opens, and when it is dismissed", () => {
    useWorkspace.setState({ limits: { ...TEST_LIMITS, max_tabs: 1 } });
    openTestProject(alpha);
    useWorkspace.getState().openProject(beta);
    expect(useWorkspace.getState().notice).not.toBeNull();

    useWorkspace.getState().dismissNotice();
    expect(useWorkspace.getState().notice).toBeNull();

    useWorkspace.getState().openProject(beta);
    useWorkspace.getState().activate(alpha.path);
    useWorkspace.getState().openProject(alpha);
    expect(useWorkspace.getState().notice).toBeNull();
  });

  it("cannot open anything before the limits are known", () => {
    useWorkspace.setState({ limits: null });

    expect(() => useWorkspace.getState().openProject(alpha)).toThrow(
      "limits are not loaded",
    );
  });
});

describe("closing and activating tabs", () => {
  it("hands the active tab to the one on its right, else the one on its left", () => {
    openTestProject(alpha);
    openTestProject(beta);
    openTestProject(gamma);
    useWorkspace.getState().activate(beta.path);

    useWorkspace.getState().closeTab(beta.path);
    expect(activeRoot()).toBe(gamma.path);

    useWorkspace.getState().closeTab(gamma.path);
    expect(activeRoot()).toBe(alpha.path);

    useWorkspace.getState().closeTab(alpha.path);
    expect(activeRoot()).toBeNull();
    expect(roots()).toEqual([]);
  });

  it("keeps the active tab when a background tab closes", () => {
    openTestProject(alpha);
    openTestProject(beta);

    useWorkspace.getState().closeTab(alpha.path);

    expect(activeRoot()).toBe(beta.path);
    expect(roots()).toEqual([beta.path]);
  });

  it("keeps open a tab whose project is being written to", () => {
    openTestProject(alpha);
    openTestProject(beta);
    useWorkspace
      .getState()
      .updateGitActions(alpha.path, (state) => ({ ...state, running: "push" }));

    expect(useWorkspace.getState().closeTab(alpha.path)).toBe("busy");
    expect(roots()).toEqual([alpha.path, beta.path]);

    useWorkspace
      .getState()
      .updateGitActions(alpha.path, (state) => ({ ...state, running: null }));
    expect(useWorkspace.getState().closeTab(alpha.path)).toBe("closed");
    expect(roots()).toEqual([beta.path]);
  });

  it("ignores a tab that is not open", () => {
    openTestProject(alpha);
    const before = useWorkspace.getState().tabs;

    expect(useWorkspace.getState().closeTab("/projects/never-opened")).toBe(
      "closed",
    );
    useWorkspace.getState().activate("/projects/never-opened");

    expect(useWorkspace.getState().tabs).toBe(before);
    expect(activeRoot()).toBe(alpha.path);
  });
});

describe("moving tabs", () => {
  beforeEach(() => {
    openTestProject(alpha);
    openTestProject(beta);
    openTestProject(gamma);
    useWorkspace.getState().activate(beta.path);
  });

  it("puts a tab at a position and keeps the active tab active", () => {
    useWorkspace.getState().moveTab(alpha.path, 2);

    expect(roots()).toEqual([beta.path, gamma.path, alpha.path]);
    expect(activeRoot()).toBe(beta.path);

    useWorkspace.getState().moveTab(alpha.path, 0);
    expect(roots()).toEqual([alpha.path, beta.path, gamma.path]);
  });

  it("clamps a position outside the row to its ends", () => {
    useWorkspace.getState().moveTab(beta.path, 99);
    expect(roots()).toEqual([alpha.path, gamma.path, beta.path]);

    useWorkspace.getState().moveTab(beta.path, -4);
    expect(roots()).toEqual([beta.path, alpha.path, gamma.path]);
  });

  it("leaves the row as it was for a tab already there, or not open", () => {
    const before = useWorkspace.getState().tabs;

    useWorkspace.getState().moveTab(beta.path, 1);
    useWorkspace.getState().moveTab("/projects/never-opened", 0);

    expect(useWorkspace.getState().tabs).toBe(before);
  });

  it("keeps each tab's own state when it changes place", () => {
    navigationActionsFor(gamma.path).selectCommit(COMMIT);

    useWorkspace.getState().moveTab(gamma.path, 0);

    const moved = useWorkspace.getState().tabs[0];
    expect(moved?.repository.path).toBe(gamma.path);
    expect(moved?.navigation.selection).toMatchObject({ commitId: COMMIT });
  });
});

describe("per-tab navigation", () => {
  it("keeps each tab's selection while another is shown", () => {
    openTestProject(alpha);
    navigationActionsFor(alpha.path).selectCommit(COMMIT);
    openTestProject(beta);

    expect(activeNavigation().selection).toEqual({ kind: "history" });
    useWorkspace.getState().activate(alpha.path);
    expect(activeNavigation().selection).toEqual({
      kind: "commit",
      commitId: COMMIT,
      filePath: null,
    });
  });

  it("applies a change to the tab it was made for, not to the active one", () => {
    openTestProject(alpha);
    const forAlpha = navigationActionsFor(alpha.path);
    openTestProject(beta);

    forAlpha.selectCommit(COMMIT);

    expect(activeNavigation().selection).toEqual({ kind: "history" });
    const alphaTab = useWorkspace
      .getState()
      .tabs.find((tab) => tab.repository.path === alpha.path);
    expect(alphaTab?.navigation.selection).toMatchObject({ commitId: COMMIT });
  });

  it("does nothing for a project that has since closed, or for none", () => {
    openTestProject(alpha);
    const forAlpha = navigationActionsFor(alpha.path);
    useWorkspace.getState().closeTab(alpha.path);
    const before = useWorkspace.getState().tabs;

    forAlpha.selectCommit(COMMIT);
    navigationActionsFor(null).selectCommit(COMMIT);

    expect(useWorkspace.getState().tabs).toBe(before);
  });

  it("does not replace the tabs when a change leaves the navigation as it was", () => {
    openTestProject(alpha);
    navigationActionsFor(alpha.path).selectCommit(COMMIT);
    const before = useWorkspace.getState().tabs;

    navigationActionsFor(alpha.path).selectCommit(COMMIT);

    expect(useWorkspace.getState().tabs).toBe(before);
  });
});

describe("view state per tab", () => {
  it("keeps the search, folders and pin of each project to itself", () => {
    openTestProject(alpha);
    const forAlpha = navigationActionsFor(alpha.path);
    forAlpha.setSearchQuery("login");
    forAlpha.toggleFolder("src");
    forAlpha.setSidebarPinned(true);
    forAlpha.setHistoryAnchor(COMMIT);
    openTestProject(beta);

    expect(activeNavigation()).toMatchObject({
      searchQuery: "",
      sidebarPinned: false,
      historyAnchor: null,
    });
    expect(activeNavigation().collapsedFolders.size).toBe(0);

    useWorkspace.getState().activate(alpha.path);
    expect(activeNavigation()).toMatchObject({
      searchQuery: "login",
      sidebarPinned: true,
      historyAnchor: COMMIT,
    });
    expect([...activeNavigation().collapsedFolders]).toEqual(["src"]);
  });
});

describe("hooks", () => {
  it("follow the active tab", () => {
    openTestProject(alpha);
    const repository = renderHook(() => useActiveRepository());
    const selection = renderHook(() =>
      useNavigation((navigation) => navigation.selection),
    );
    expect(repository.result.current).toEqual(alpha);

    act(() => {
      navigationActionsFor(alpha.path).selectCommit(COMMIT);
      openTestProject(beta);
    });

    expect(repository.result.current).toEqual(beta);
    expect(selection.result.current).toEqual({ kind: "history" });
    expect(activeRepository()).toEqual(beta);
  });

  it("read an empty navigation when nothing is open", () => {
    const { result } = renderHook(() =>
      useNavigation((navigation) => navigation.selection),
    );

    expect(result.current).toEqual({ kind: "history" });
  });

  it("bind a view's actions to the project that view rendered", () => {
    openTestProject(alpha);
    const { result } = renderHook(() => useNavigationActions());
    const forAlpha = result.current;
    act(() => {
      openTestProject(beta);
    });

    // A callback captured while alpha was shown still reaches alpha.
    act(() => {
      forAlpha.selectCommit(COMMIT);
    });

    expect(activeNavigation().selection).toEqual({ kind: "history" });
    expect(result.current).not.toBe(forAlpha);
  });

  it("keep the same actions while the active tab does not change", () => {
    openTestProject(alpha);
    const { result, rerender } = renderHook(() => useNavigationActions());
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });
});
