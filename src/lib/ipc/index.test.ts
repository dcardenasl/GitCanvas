import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Every command the generated bindings expose, recorded by name so the wrapper
 * layer can be checked without a running application.
 */
const calls: { command: string; args: unknown[] }[] = [];
let outcome:
  { status: "ok"; data: unknown } | { status: "error"; error: unknown } = {
  status: "ok",
  data: null,
};

const commands = new Proxy(
  {},
  {
    get:
      (_target, command: string) =>
      (...args: unknown[]) => {
        calls.push({ command, args });
        return Promise.resolve(outcome);
      },
  },
);

const listen = vi.fn<(...args: unknown[]) => Promise<() => void>>();
vi.mock("../../bindings", () => ({
  commands,
  events: {
    cloneProgressEvent: { listen: (...args: unknown[]) => listen(...args) },
    repositoryChangedEvent: { listen: (...args: unknown[]) => listen(...args) },
  },
}));

const ipc = await import("./index");

beforeEach(() => {
  calls.length = 0;
  outcome = { status: "ok", data: null };
  listen.mockReset();
});

const PATH = "/tmp/repo";

/** Each wrapper, how to call it, and the command it must forward to. */
const FORWARDS: [string, () => Promise<unknown>, string, unknown[]][] = [
  ["openRepository", () => ipc.openRepository(PATH), "openRepository", [PATH]],
  [
    "getStartupRepository",
    () => ipc.getStartupRepository(),
    "getStartupRepository",
    [],
  ],
  [
    "validateRepository",
    () => ipc.validateRepository(PATH),
    "validateRepository",
    [PATH],
  ],
  [
    "getCommits",
    () => ipc.getCommits(PATH, { limit: 5, cursor: null, roots: null }),
    "getCommits",
    [PATH, { limit: 5, cursor: null, roots: null }],
  ],
  ["getBranches", () => ipc.getBranches(PATH), "getBranches", [PATH]],
  ["getTags", () => ipc.getTags(PATH), "getTags", [PATH]],
  [
    "getCommitDiff",
    () =>
      ipc.getCommitDiff(PATH, {
        commit_id: "a",
        file_path: null,
        expand_path: null,
      }),
    "getCommitDiff",
    [PATH, { commit_id: "a", file_path: null, expand_path: null }],
  ],
  [
    "getCommitTreePage",
    () =>
      ipc.getCommitTreePage(PATH, {
        commit_id: "a",
        directory_path: null,
        offset: 0,
      }),
    "getCommitTreePage",
    [PATH, { commit_id: "a", directory_path: null, offset: 0 }],
  ],
  [
    "storeGithubToken",
    () => ipc.storeGithubToken("t"),
    "storeGithubToken",
    ["t"],
  ],
  ["hasGithubToken", () => ipc.hasGithubToken(), "hasGithubToken", []],
  ["forgetGithubToken", () => ipc.forgetGithubToken(), "forgetGithubToken", []],
  [
    "listGithubRepositories",
    () => ipc.listGithubRepositories(),
    "listGithubRepositories",
    [],
  ],
  [
    "cloneGithubRepository",
    () => ipc.cloneGithubRepository("https://github.com/o/r.git", "o/r", null),
    "cloneGithubRepository",
    ["https://github.com/o/r.git", "o/r", null],
  ],
  [
    "getCloneCacheStatus",
    () => ipc.getCloneCacheStatus(),
    "getCloneCacheStatus",
    [],
  ],
  [
    "checkoutBranch",
    () => ipc.checkoutBranch(PATH, "dev", false),
    "checkoutBranch",
    [PATH, "dev", false],
  ],
  [
    "pullFastForward",
    () => ipc.pullFastForward(PATH),
    "pullFastForward",
    [PATH],
  ],
  [
    "pushCurrentBranch",
    () => ipc.pushCurrentBranch(PATH),
    "pushCurrentBranch",
    [PATH],
  ],
  [
    "getFileContent",
    () =>
      ipc.getFileContent(PATH, { commit_id: "a", path: "f", expand: false }),
    "getFileContent",
    [PATH, { commit_id: "a", path: "f", expand: false }],
  ],
  [
    "getWorktreeSnapshot",
    () =>
      ipc.getWorktreeSnapshot(PATH, {
        staged_cursor: null,
        unstaged_cursor: null,
        limit: null,
        expected_revision: null,
      }),
    "getWorktreeSnapshot",
    [
      PATH,
      {
        staged_cursor: null,
        unstaged_cursor: null,
        limit: null,
        expected_revision: null,
      },
    ],
  ],
  [
    "getWorktreeFileDiff",
    () =>
      ipc.getWorktreeFileDiff(PATH, {
        side: "staged",
        path: "f",
        expected_revision: null,
        expand: false,
      }),
    "getWorktreeFileDiff",
    [
      PATH,
      { side: "staged", path: "f", expected_revision: null, expand: false },
    ],
  ],
  [
    "getWorktreeFileContent",
    () =>
      ipc.getWorktreeFileContent(PATH, {
        side: "unstaged",
        path: "f",
        expected_revision: null,
        expand: true,
      }),
    "getWorktreeFileContent",
    [
      PATH,
      { side: "unstaged", path: "f", expected_revision: null, expand: true },
    ],
  ],
  [
    "getWorktreeFingerprint",
    () => ipc.getWorktreeFingerprint(PATH),
    "getWorktreeFingerprint",
    [PATH],
  ],
  [
    "watchRepository",
    () => ipc.watchRepository({ path: PATH, generation: 3 }),
    "watchRepository",
    [{ path: PATH, generation: 3 }],
  ],
  [
    "unwatchRepository",
    () => ipc.unwatchRepository(3),
    "unwatchRepository",
    [3],
  ],
];

describe("the typed IPC boundary", () => {
  it.each(FORWARDS)(
    "%s forwards its arguments and unwraps the result",
    async (_name, call, command, args) => {
      outcome = { status: "ok", data: { answer: 42 } };

      await expect(call()).resolves.toEqual({ answer: 42 });

      expect(calls).toEqual([{ command, args }]);
    },
  );

  it("turns a backend error into an IpcError that keeps its kind", async () => {
    outcome = {
      status: "error",
      error: { kind: "InvalidRepository", message: "not a repository" },
    };

    const failure = await ipc
      .openRepository(PATH)
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ipc.IpcError);
    expect((failure as InstanceType<typeof ipc.IpcError>).kind).toBe(
      "InvalidRepository",
    );
    expect((failure as Error).message).toBe("not a repository");
  });

  it("subscribes to events through the generated listeners", () => {
    void ipc.onCloneProgress(() => undefined);
    void ipc.onRepositoryChanged(() => undefined);

    expect(listen).toHaveBeenCalledTimes(2);
  });
});
