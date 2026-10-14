import { beforeEach, describe, expect, it } from "vitest";

import {
  activeNavigation,
  activeRoot,
  openTestProject,
  resetWorkspace,
  TEST_LIMITS,
} from "../../test/workspace";
import { selectCommit, setSearchQuery } from "../navigation";
import { useWorkspace } from "../workspace";
import { MAX_CLOSED_TABS } from "./closedTabsSlice";

const project = (name: string) => ({ path: `/work/${name}`, name });
const COMMIT = "a".repeat(40);

beforeEach(resetWorkspace);

function roots(): string[] {
  return useWorkspace.getState().tabs.map((tab) => tab.repository.path);
}

function closedRoots(): string[] {
  return useWorkspace.getState().closedTabs.map((tab) => tab.repository.path);
}

describe("closing remembers the tab", () => {
  it("keeps the newest first, each project once", () => {
    ["a", "b", "c"].forEach((name) => openTestProject(project(name)));

    useWorkspace.getState().closeTab("/work/a");
    useWorkspace.getState().closeTab("/work/b");

    expect(closedRoots()).toEqual(["/work/b", "/work/a"]);
  });

  it("forgets the oldest past its bound", () => {
    const names = Array.from(
      { length: MAX_CLOSED_TABS + 3 },
      (_, i) => `p${String(i)}`,
    );
    names.forEach((name) => openTestProject(project(name)));
    useWorkspace.setState({ limits: { ...TEST_LIMITS, max_tabs: 99 } });

    names.forEach((name) => useWorkspace.getState().closeTab(`/work/${name}`));

    expect(closedRoots()).toHaveLength(MAX_CLOSED_TABS);
    expect(closedRoots()[0]).toBe(`/work/${names.at(-1) ?? ""}`);
  });

  it("does not remember a tab that stayed open because it is being written to", () => {
    openTestProject(project("a"));
    useWorkspace
      .getState()
      .updateGitActions("/work/a", (state) => ({ ...state, running: "pull" }));

    useWorkspace.getState().closeTab("/work/a");

    expect(closedRoots()).toEqual([]);
  });
});

describe("reopening", () => {
  it("returns the tab where it was left, active, and still to be checked", () => {
    openTestProject(project("a"));
    openTestProject(project("b"));
    useWorkspace.getState().navigate("/work/a", selectCommit(COMMIT));
    useWorkspace.getState().navigate("/work/a", setSearchQuery("login"));
    useWorkspace.getState().closeTab("/work/a");

    expect(useWorkspace.getState().reopenClosedTab()).toBe("reopened");

    expect(roots()).toEqual(["/work/b", "/work/a"]);
    expect(activeRoot()).toBe("/work/a");
    expect(activeNavigation().searchQuery).toBe("login");
    expect(activeNavigation().selection).toMatchObject({ commitId: COMMIT });
    const reopened = useWorkspace.getState().tabs.at(-1);
    expect(reopened?.verification.status).toBe("unverified");
    expect(closedRoots()).toEqual([]);
  });

  it("goes back through the closed tabs one at a time, newest first", () => {
    ["a", "b", "c"].forEach((name) => openTestProject(project(name)));
    useWorkspace.getState().closeTab("/work/a");
    useWorkspace.getState().closeTab("/work/b");

    useWorkspace.getState().reopenClosedTab();
    expect(activeRoot()).toBe("/work/b");
    useWorkspace.getState().reopenClosedTab();
    expect(activeRoot()).toBe("/work/a");
    expect(useWorkspace.getState().reopenClosedTab()).toBe("none");
  });

  it("skips a project that was opened again some other way", () => {
    ["a", "b", "c"].forEach((name) => openTestProject(project(name)));
    useWorkspace.getState().closeTab("/work/a");
    useWorkspace.getState().closeTab("/work/b");
    openTestProject(project("b"));

    expect(useWorkspace.getState().reopenClosedTab()).toBe("reopened");

    expect(activeRoot()).toBe("/work/a");
    expect(roots().filter((root) => root === "/work/b")).toHaveLength(1);
  });

  it("clears closed tabs that are open again even when nothing is left to reopen", () => {
    ["a", "b"].forEach((name) => openTestProject(project(name)));
    useWorkspace.getState().closeTab("/work/a");
    openTestProject(project("a"));

    expect(useWorkspace.getState().reopenClosedTab()).toBe("none");

    expect(closedRoots()).toEqual([]);
  });

  it("says so and keeps the closed tab when the tab limit is reached", () => {
    ["a", "b"].forEach((name) => openTestProject(project(name)));
    useWorkspace.getState().closeTab("/work/a");
    useWorkspace.setState({ limits: { ...TEST_LIMITS, max_tabs: 1 } });

    expect(useWorkspace.getState().reopenClosedTab()).toBe("limit");

    expect(roots()).toEqual(["/work/b"]);
    expect(closedRoots()).toEqual(["/work/a"]);
    expect(useWorkspace.getState().notice).toEqual({
      code: "tabLimit",
      max: 1,
    });
  });

  it("leaves a full-window view and counts as using the project", () => {
    ["a", "b"].forEach((name) => openTestProject(project(name)));
    useWorkspace.getState().closeTab("/work/a");
    useWorkspace.getState().setGitHubOpen(true);

    useWorkspace.getState().reopenClosedTab();

    expect(useWorkspace.getState().githubOpen).toBe(false);
    expect(useWorkspace.getState().recents[0]).toBe("/work/a");
  });

  it("does nothing, and says nothing, when there is nothing closed", () => {
    openTestProject(project("a"));

    expect(useWorkspace.getState().reopenClosedTab()).toBe("none");
    expect(useWorkspace.getState().notice).toBeNull();
  });
});
