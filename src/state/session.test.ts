import { beforeEach, describe, expect, it } from "vitest";

import {
  selectedCommitId,
  selectedFilePath,
  selectedFileSource,
  useSession,
} from "./session";

const COMMIT = "a".repeat(40);

beforeEach(() => {
  useSession.setState({
    repository: null,
    selection: { kind: "history" },
    revealCommitId: null,
    expandedFilePath: null,
  });
});

describe("session selection", () => {
  it("represents a commit file without independent source fields", () => {
    useSession.getState().selectCommit(COMMIT);
    useSession.getState().selectFile("src/app.ts");

    expect(useSession.getState().selection).toEqual({
      kind: "commit",
      commitId: COMMIT,
      filePath: "src/app.ts",
    });
  });

  it("clears the file and expansion when changing commit", () => {
    useSession.getState().selectCommit(COMMIT);
    useSession.getState().selectFile("src/app.ts");
    useSession.getState().expandFile("src/app.ts");
    useSession.getState().selectCommit("b".repeat(40));

    expect(useSession.getState().selection).toEqual({
      kind: "commit",
      commitId: "b".repeat(40),
      filePath: null,
    });
    expect(useSession.getState().expandedFilePath).toBeNull();
  });

  it("changes origin and clears expansion atomically", () => {
    useSession.getState().selectCommit(COMMIT);
    useSession.getState().expandFile("src/app.ts");
    useSession.getState().selectFile("local.ts", "unstaged");

    expect(useSession.getState().selection).toEqual({
      kind: "worktree",
      side: "unstaged",
      filePath: "local.ts",
    });
    expect(useSession.getState().expandedFilePath).toBeNull();
  });

  it("closes an invalid local selection when its file is cleared", () => {
    useSession.getState().selectFile("local.ts", "staged");
    useSession.getState().selectFile(null);

    expect(useSession.getState().selection).toEqual({ kind: "history" });
  });
});

describe("session repository and reveal", () => {
  const REPO = { path: "/tmp/repo", name: "repo" };

  it("opening a repository resets everything that belonged to the last one", () => {
    useSession.getState().selectCommit(COMMIT);
    useSession.getState().expandFile("a.ts");
    useSession.getState().revealCommit(COMMIT);

    useSession.getState().openRepository(REPO);

    const state = useSession.getState();
    expect(state.repository).toEqual(REPO);
    expect(state.selection).toEqual({ kind: "history" });
    expect(state.revealCommitId).toBeNull();
    expect(state.expandedFilePath).toBeNull();
  });

  it("closing a repository leaves nothing selected", () => {
    useSession.getState().openRepository(REPO);
    useSession.getState().selectCommit(COMMIT);

    useSession.getState().closeRepository();

    expect(useSession.getState().repository).toBeNull();
    expect(useSession.getState().selection).toEqual({ kind: "history" });
  });

  it("revealing a commit selects it and asks the table to scroll there", () => {
    useSession.getState().revealCommit(COMMIT);

    expect(useSession.getState().selection).toEqual({
      kind: "commit",
      commitId: COMMIT,
      filePath: null,
    });
    expect(useSession.getState().revealCommitId).toBe(COMMIT);

    useSession.getState().clearReveal();
    expect(useSession.getState().revealCommitId).toBeNull();
  });
});

describe("session file selection", () => {
  it("keeps the commit but drops the file when the file is cleared", () => {
    useSession.getState().selectCommit(COMMIT);
    useSession.getState().selectFile("a.ts");

    useSession.getState().selectFile(null);

    expect(useSession.getState().selection).toEqual({
      kind: "commit",
      commitId: COMMIT,
      filePath: null,
    });
  });

  it("returns to the history when a local file is cleared", () => {
    useSession.getState().selectFile("a.ts", "staged");

    useSession.getState().selectFile(null);

    expect(useSession.getState().selection).toEqual({ kind: "history" });
  });

  it("ignores a committed file when no commit is selected", () => {
    useSession.getState().selectFile("a.ts", "commit");

    expect(useSession.getState().selection).toEqual({ kind: "history" });
  });

  it("opens a file as a snapshot on request", () => {
    useSession.getState().selectCommit(COMMIT);

    useSession.getState().selectFile("a.ts", "commit", "snapshot");

    expect(useSession.getState().selection).toEqual({
      kind: "commit",
      commitId: COMMIT,
      filePath: "a.ts",
      fileMode: "snapshot",
    });
  });

  it("keeps the expansion when the same commit is selected again", () => {
    useSession.getState().selectCommit(COMMIT);
    useSession.getState().expandFile("a.ts");

    useSession.getState().selectCommit(COMMIT);

    expect(useSession.getState().expandedFilePath).toBe("a.ts");
  });

  it("goes back to the history when the commit is deselected", () => {
    useSession.getState().selectCommit(COMMIT);

    useSession.getState().selectCommit(null);

    expect(useSession.getState().selection).toEqual({ kind: "history" });
  });
});

describe("session selectors", () => {
  it("read the commit, file and source out of any selection", () => {
    const state = () => useSession.getState();
    expect(selectedCommitId(state())).toBeNull();
    expect(selectedFilePath(state())).toBeNull();
    expect(selectedFileSource(state())).toBeNull();

    state().selectCommit(COMMIT);
    state().selectFile("a.ts");
    expect(selectedCommitId(state())).toBe(COMMIT);
    expect(selectedFilePath(state())).toBe("a.ts");
    expect(selectedFileSource(state())).toBe("commit");

    state().selectFile("b.ts", "unstaged");
    expect(selectedCommitId(state())).toBeNull();
    expect(selectedFileSource(state())).toBe("unstaged");
  });
});
