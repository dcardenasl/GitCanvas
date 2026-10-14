import { describe, expect, it } from "vitest";

import {
  clearOrphanedReveal,
  clearReveal,
  EMPTY_NAVIGATION,
  expandFile,
  revealCommit,
  selectCommit,
  selectedCommitId,
  selectedFilePath,
  selectedFileSource,
  selectFile,
  type Navigation,
  type Transition,
} from "./navigation";

const COMMIT = "a".repeat(40);
const OTHER = "b".repeat(40);

/** Applies transitions in order to a freshly opened project. */
function after(...transitions: Transition[]): Navigation {
  return transitions.reduce(
    (navigation, transition) => transition(navigation),
    EMPTY_NAVIGATION,
  );
}

describe("navigation selection", () => {
  it("represents a commit file without independent source fields", () => {
    expect(
      after(selectCommit(COMMIT), selectFile("src/app.ts")).selection,
    ).toEqual({ kind: "commit", commitId: COMMIT, filePath: "src/app.ts" });
  });

  it("clears the file and expansion when changing commit", () => {
    const navigation = after(
      selectCommit(COMMIT),
      selectFile("src/app.ts"),
      expandFile("src/app.ts"),
      selectCommit(OTHER),
    );

    expect(navigation.selection).toEqual({
      kind: "commit",
      commitId: OTHER,
      filePath: null,
    });
    expect(navigation.expandedFilePath).toBeNull();
  });

  it("changes origin and clears expansion atomically", () => {
    const navigation = after(
      selectCommit(COMMIT),
      expandFile("src/app.ts"),
      selectFile("local.ts", "unstaged"),
    );

    expect(navigation.selection).toEqual({
      kind: "worktree",
      side: "unstaged",
      filePath: "local.ts",
    });
    expect(navigation.expandedFilePath).toBeNull();
  });

  it("closes an invalid local selection when its file is cleared", () => {
    expect(
      after(selectFile("local.ts", "staged"), selectFile(null)).selection,
    ).toEqual({ kind: "history" });
  });

  it("keeps the commit but drops the file when the file is cleared", () => {
    expect(
      after(selectCommit(COMMIT), selectFile("a.ts"), selectFile(null))
        .selection,
    ).toEqual({ kind: "commit", commitId: COMMIT, filePath: null });
  });

  it("ignores a committed file when no commit is selected", () => {
    expect(after(selectFile("a.ts", "commit")).selection).toEqual({
      kind: "history",
    });
  });

  it("opens a file as a snapshot on request", () => {
    expect(
      after(selectCommit(COMMIT), selectFile("a.ts", "commit", "snapshot"))
        .selection,
    ).toEqual({
      kind: "commit",
      commitId: COMMIT,
      filePath: "a.ts",
      fileMode: "snapshot",
    });
  });

  it("keeps the expansion when the same commit is selected again", () => {
    const navigation = after(
      selectCommit(COMMIT),
      expandFile("a.ts"),
      selectCommit(COMMIT),
    );

    expect(navigation.expandedFilePath).toBe("a.ts");
  });

  it("returns the very same value when selecting the commit already selected", () => {
    const selected = after(selectCommit(COMMIT));

    expect(selectCommit(COMMIT)(selected)).toBe(selected);
  });

  it("goes back to the history when the commit is deselected", () => {
    expect(after(selectCommit(COMMIT), selectCommit(null)).selection).toEqual({
      kind: "history",
    });
  });
});

describe("navigation reveal", () => {
  it("selects the commit and asks the table to scroll there", () => {
    const navigation = after(revealCommit(COMMIT));

    expect(navigation.selection).toEqual({
      kind: "commit",
      commitId: COMMIT,
      filePath: null,
    });
    expect(navigation.revealCommitId).toBe(COMMIT);
    expect(clearReveal(navigation).revealCommitId).toBeNull();
  });

  it("leaves a navigation with nothing to clear untouched", () => {
    expect(clearReveal(EMPTY_NAVIGATION)).toBe(EMPTY_NAVIGATION);
    expect(clearOrphanedReveal(EMPTY_NAVIGATION)).toBe(EMPTY_NAVIGATION);
  });

  it("clears the selection when a requested commit is absent from history", () => {
    const navigation = after(revealCommit(COMMIT), clearOrphanedReveal);

    expect(navigation.selection).toEqual({ kind: "history" });
    expect(navigation.revealCommitId).toBeNull();
  });

  it("preserves a newer selection when an older reveal becomes orphaned", () => {
    const navigation = after(
      revealCommit(COMMIT),
      selectCommit(OTHER),
      clearOrphanedReveal,
    );

    expect(navigation.selection).toEqual({
      kind: "commit",
      commitId: OTHER,
      filePath: null,
    });
    expect(navigation.revealCommitId).toBeNull();
  });
});

describe("navigation selectors", () => {
  it("read the commit, file and source out of any selection", () => {
    expect(selectedCommitId(EMPTY_NAVIGATION)).toBeNull();
    expect(selectedFilePath(EMPTY_NAVIGATION)).toBeNull();
    expect(selectedFileSource(EMPTY_NAVIGATION.selection)).toBeNull();

    const committed = after(selectCommit(COMMIT), selectFile("a.ts"));
    expect(selectedCommitId(committed)).toBe(COMMIT);
    expect(selectedFilePath(committed)).toBe("a.ts");
    expect(selectedFileSource(committed.selection)).toBe("commit");

    const local = after(selectCommit(COMMIT), selectFile("b.ts", "unstaged"));
    expect(selectedCommitId(local)).toBeNull();
    expect(selectedFileSource(local.selection)).toBe("unstaged");
  });
});
