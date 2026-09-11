import { beforeEach, describe, expect, it } from "vitest";

import { useSession } from "./session";

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
