import { beforeEach, describe, expect, it } from "vitest";

import { activeRoot, openTestProject, resetWorkspace } from "../test/workspace";
import {
  activatePosition,
  activateRelative,
  closeActiveTab,
  closeOtherTabs,
  closeTabsAfter,
  reopenClosedTab,
} from "./tabCommands";
import { useWorkspace } from "./workspace";

const projects = ["a", "b", "c", "d"].map((name) => ({
  path: `/work/${name}`,
  name,
}));

function open(count: number): void {
  projects.slice(0, count).forEach((project) => openTestProject(project));
}

beforeEach(resetWorkspace);

describe("activateRelative", () => {
  it("moves to the next and previous tab, wrapping at either end", () => {
    open(3);
    useWorkspace.getState().activate("/work/a");

    activateRelative(-1);
    expect(activeRoot()).toBe("/work/c");
    activateRelative(1);
    expect(activeRoot()).toBe("/work/a");
    activateRelative(1);
    expect(activeRoot()).toBe("/work/b");
  });

  it("does nothing with fewer than two tabs", () => {
    open(1);
    activateRelative(1);
    expect(activeRoot()).toBe("/work/a");

    resetWorkspace();
    expect(() => {
      activateRelative(1);
    }).not.toThrow();
  });
});

describe("activatePosition", () => {
  it("counts tabs from one", () => {
    open(4);

    activatePosition(2);
    expect(activeRoot()).toBe("/work/b");
    activatePosition(1);
    expect(activeRoot()).toBe("/work/a");
  });

  it("takes nine to mean the last tab, whatever its position", () => {
    open(4);
    useWorkspace.getState().activate("/work/a");

    activatePosition(9);

    expect(activeRoot()).toBe("/work/d");
  });

  it("ignores a position past the row and clamps below one", () => {
    open(2);
    useWorkspace.getState().activate("/work/a");

    activatePosition(5);
    expect(activeRoot()).toBe("/work/a");
    activatePosition(0);
    expect(activeRoot()).toBe("/work/a");
  });
});

describe("closeActiveTab", () => {
  it("closes the active tab and reports it", () => {
    open(2);

    expect(closeActiveTab()).toBe("closed");

    expect(activeRoot()).toBe("/work/a");
  });

  it("leaves a tab that is being written to open", () => {
    open(2);
    useWorkspace
      .getState()
      .updateGitActions("/work/b", (state) => ({ ...state, running: "push" }));

    expect(closeActiveTab()).toBe("busy");

    expect(useWorkspace.getState().tabs).toHaveLength(2);
  });

  it("does nothing when no project is open", () => {
    expect(closeActiveTab()).toBeNull();
  });
});

describe("reopenClosedTab", () => {
  it("brings back what closeActiveTab closed", () => {
    open(2);
    closeActiveTab();

    expect(reopenClosedTab()).toBe("reopened");

    expect(activeRoot()).toBe("/work/b");
    expect(useWorkspace.getState().tabs).toHaveLength(2);
  });

  it("does nothing when nothing was closed", () => {
    open(2);

    expect(reopenClosedTab()).toBe("none");
  });
});

describe("closeOtherTabs", () => {
  it("keeps only the named tab and makes it the active one", () => {
    open(4);
    useWorkspace.getState().activate("/work/d");

    closeOtherTabs("/work/b");

    expect(useWorkspace.getState().tabs.map((t) => t.repository.name)).toEqual([
      "b",
    ]);
    expect(activeRoot()).toBe("/work/b");
  });

  it("leaves a tab that is being written to open, with the named one active", () => {
    open(3);
    useWorkspace
      .getState()
      .updateGitActions("/work/c", (state) => ({ ...state, running: "push" }));

    closeOtherTabs("/work/a");

    expect(useWorkspace.getState().tabs.map((t) => t.repository.name)).toEqual([
      "a",
      "c",
    ]);
    expect(activeRoot()).toBe("/work/a");
  });

  it("does nothing for a project that is not open", () => {
    open(2);

    closeOtherTabs("/work/zzz");

    expect(useWorkspace.getState().tabs).toHaveLength(2);
  });

  it("remembers what it closed, so it can be undone one tab at a time", () => {
    open(3);

    closeOtherTabs("/work/a");

    expect(useWorkspace.getState().closedTabs).toHaveLength(2);
  });
});

describe("closeTabsAfter", () => {
  it("closes the tabs after the named one and leaves those before", () => {
    open(4);

    closeTabsAfter("/work/b");

    expect(useWorkspace.getState().tabs.map((t) => t.repository.name)).toEqual([
      "a",
      "b",
    ]);
  });

  it("makes the named tab active only when the active tab was closed", () => {
    open(4);
    useWorkspace.getState().activate("/work/a");
    closeTabsAfter("/work/b");
    expect(activeRoot()).toBe("/work/a");

    open(4);
    useWorkspace.getState().activate("/work/d");
    closeTabsAfter("/work/b");
    expect(activeRoot()).toBe("/work/b");
  });

  it("does nothing for the last tab, or a project that is not open", () => {
    open(2);

    closeTabsAfter("/work/b");
    closeTabsAfter("/work/zzz");

    expect(useWorkspace.getState().tabs).toHaveLength(2);
  });
});
