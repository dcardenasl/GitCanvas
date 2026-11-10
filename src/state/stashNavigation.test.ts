import { describe, expect, it } from "vitest";
import {
  EMPTY_NAVIGATION,
  openFileHistory,
  revealCommit,
  selectCommit,
  selectFile,
} from "./navigation";
import { closeStash, openStash, updateStash } from "./stashNavigation";
import { stashEntry } from "../test/stash";
import {
  activeNavigation,
  openTestProject,
  resetWorkspace,
} from "../test/workspace";
import { navigationActionsFor, useWorkspace } from "./workspace";
import { restoreTab, workspaceRecord } from "./workspaceRecords";

describe("saved-state overlay", () => {
  it("preserves graph selection and anchor through opening and closing", () => {
    const underlying = {
      ...EMPTY_NAVIGATION,
      selection: {
        kind: "commit" as const,
        commitId: "base",
        filePath: "a.txt",
      },
      historyAnchor: "anchor",
    };
    const opened = openStash(stashEntry())(underlying);
    expect(opened.selection).toBe(underlying.selection);
    expect(opened.stash?.center).toBe("graph");
    expect(openStash(stashEntry())(opened)).toBe(opened);
    expect(closeStash(opened)).toEqual(underlying);
    expect(closeStash(underlying)).toBe(underlying);
  });

  it("ignores late results for an inspection that has since changed", () => {
    const opened = openStash(stashEntry())(EMPTY_NAVIGATION);
    expect(
      updateStash("other", (view) => ({ ...view, removed: true }))(opened),
    ).toBe(opened);
    expect(updateStash(stashEntry().stash_id, (view) => view)(opened)).toBe(
      opened,
    );
    const changed = openStash(stashEntry({ stash_id: "b".repeat(40) }))(opened);
    expect(
      updateStash(stashEntry().stash_id, (view) => ({
        ...view,
        removed: true,
      }))(changed),
    ).toBe(changed);
  });

  it("explicit graph and local navigation exit the inspection", () => {
    const opened = openStash(stashEntry())(EMPTY_NAVIGATION);
    for (const transition of [
      selectCommit(null),
      selectCommit("base"),
      revealCommit("base"),
      selectFile("a.txt", "staged"),
      openFileHistory("a.txt", "base", false),
    ]) {
      expect(transition(opened).stash).toBeNull();
    }
  });

  it("binds callbacks to their tab and excludes inspection from durable records", () => {
    resetWorkspace();
    openTestProject();
    const actions = navigationActionsFor("/tmp/repo");
    actions.selectCommit("base");
    actions.setHistoryAnchor("anchor");
    actions.openStash(stashEntry());
    openTestProject({ path: "/tmp/other", name: "other" });
    actions.updateStash(stashEntry().stash_id, (view) => ({
      ...view,
      mode: "unstaged",
      removed: true,
    }));
    expect(activeNavigation().stash).toBeNull();
    const state = useWorkspace.getState();
    expect(state.tabs[0]?.navigation.stash?.mode).toBe("unstaged");
    const saved = workspaceRecord(state);
    const record = saved.tabs[0];
    if (record === undefined) throw new Error("Expected first tab");
    expect(JSON.stringify(record)).not.toContain("stash");
    expect(restoreTab(record).navigation.stash).toBeNull();
    expect(restoreTab(record).navigation.historyAnchor).toBe("anchor");
    expect(restoreTab(record).navigation.selection).toEqual({
      kind: "commit",
      commitId: "base",
      filePath: null,
    });
  });
});
