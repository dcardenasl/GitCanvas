import { beforeEach, describe, expect, it } from "vitest";

import { activeRoot, openTestProject, resetWorkspace } from "../test/workspace";
import {
  activatePosition,
  activateRelative,
  closeActiveTab,
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
