/** Typed application boundary over the generated Rust contract. */
import { commands, events } from "../../bindings";
import type {
  AppError,
  SaveWorkspaceRequest,
  DiffRequest,
  CommitTreeRequest,
  FileContentRequest,
  HistoryRequest,
  OpenRepositoriesRequest,
  WorktreeFileDiffRequest,
  WorktreeFileContentRequest,
  WorktreeSnapshotRequest,
  WatchRequest,
  MenuLabels,
} from "../../bindings";

export type {
  CheckoutOutcome,
  DirtyPath,
  PullOutcome,
  PushOutcome,
  CloneProgressEvent,
  GitHubRepository,
  CommitDiff,
  CommitTreeEntry,
  CommitTreePage,
  CommitTreeRequest,
  FileChange,
  FileContent,
  FileDiff,
  AppError,
  BranchInfo,
  CommitInfo,
  HistoryPage,
  RepositoryInfo,
  TagInfo,
  WorktreeFileDiff,
  WorktreeFileDiffRequest,
  WorktreeFileContent,
  WorktreeFingerprint,
  WorktreeSnapshot,
} from "../../bindings";

/** A domain error with a stable category for actionable UI messages. */
export class IpcError extends Error {
  readonly kind: AppError["kind"];

  constructor(error: AppError) {
    super(error.message);
    this.name = "IpcError";
    this.kind = error.kind;
  }
}

async function result<T>(
  response: Promise<
    { status: "ok"; data: T } | { status: "error"; error: AppError }
  >,
): Promise<T> {
  const value = await response;
  if (value.status === "error") throw new IpcError(value.error);
  return value.data;
}

/** Opens a validated repository and returns its canonical identity. */
export const openRepository = (path: string) =>
  result(commands.openRepository(path));
/** The repository named on the command line, if there was one. */
export const getStartupRepository = () =>
  result(commands.getStartupRepository());
/** Reads the next bounded history page from its original snapshot. */
export const getCommits = (path: string, request: HistoryRequest) =>
  result(commands.getCommits(path, request));
/** Reads immutable metadata for one full commit id without paging history. */
export const getCommit = (path: string, commitId: string) =>
  result(commands.getCommit(path, commitId));
/** Reads branches, tags, HEAD and frozen roots as one reference generation. */
export const getRepositoryRefs = (path: string) =>
  result(commands.getRepositoryRefs(path));
/** Reads a commit's changes against its first parent. */
export const getCommitDiff = (path: string, request: DiffRequest) =>
  result(commands.getCommitDiff(path, request));
/** Reads one bounded page of direct children from a directory in a commit. */
export const getCommitTreePage = (path: string, request: CommitTreeRequest) =>
  result(commands.getCommitTreePage(path, request));

/** Verifies a personal access token and stores it in the OS keychain. */
export const storeGithubToken = (token: string) =>
  result(commands.storeGithubToken(token));
/** Reports whether a token is stored. Never returns the token itself. */
export const hasGithubToken = () => result(commands.hasGithubToken());
/** Removes the stored token. */
export const forgetGithubToken = () => result(commands.forgetGithubToken());
/** Lists the repositories the stored token can reach. */
export const listGithubRepositories = () =>
  result(commands.listGithubRepositories());
/** Clones a repository into the application cache. */
export const cloneGithubRepository = (fullName: string) =>
  result(commands.cloneGithubRepository(fullName));
/** Subscribes to clone progress. Returns the unsubscribe function. */
export const onCloneProgress = events.cloneProgressEvent.listen;

/** Checks out a local branch. Refuses by default when work would be lost. */
export const checkoutBranch = (path: string, branch: string, force: boolean) =>
  result(commands.checkoutBranch(path, branch, force));
/** Fetches and fast-forwards; anything else is reported, not resolved. */
export const pullFastForward = (path: string) =>
  result(commands.pullFastForward(path));
/** Pushes the current branch to its remote. */
export const pushCurrentBranch = (path: string) =>
  result(commands.pushCurrentBranch(path));

/** Reads a file's full contents as it stands at a commit. */
export const getFileContent = (path: string, request: FileContentRequest) =>
  result(commands.getFileContent(path, request));
/** Reads both local change sets with one shared revision. */
export const getWorktreeSnapshot = (
  path: string,
  request: WorktreeSnapshotRequest,
) => result(commands.getWorktreeSnapshot(path, request));
/** Reads one local file diff on demand. */
export const getWorktreeFileDiff = (
  path: string,
  request: WorktreeFileDiffRequest,
) => result(commands.getWorktreeFileDiff(path, request));
/** Reads a staged file from the index or an unstaged file from disk. */
export const getWorktreeFileContent = (
  path: string,
  request: WorktreeFileContentRequest,
) => result(commands.getWorktreeFileContent(path, request));
/** Reads the current local revision without materializing patches. */
export const getWorktreeFingerprint = (path: string) =>
  result(commands.getWorktreeFingerprint(path));

/** Reads the bounds the workspace is held to; they do not depend on what is stored. */
export const getWorkspaceLimits = () => result(commands.getWorkspaceLimits());

/**
 * Reports the complete set of open repositories, so the backend never evicts a
 * cached clone a tab is using. A request no newer than the last one applied is
 * ignored.
 */
export const syncOpenRepositories = (request: OpenRepositoriesRequest) =>
  result(commands.syncOpenRepositories(request));

/** Starts watching the open repository, replacing any previous watch. */
export const watchRepository = (request: WatchRequest) =>
  result(commands.watchRepository(request));
/** Stops watching the generation that requested the cleanup. */
export const unwatchRepository = (generation: number) =>
  result(commands.unwatchRepository(generation));

/** Subscribes to repository changes. Returns the unsubscribe function. */
export const onRepositoryChanged = events.repositoryChangedEvent.listen;

/**
 * Sets the macOS menu bar's text. Accepted and ignored on platforms with no
 * menu bar to set.
 */
export const setMenuLabels = (labels: MenuLabels) =>
  result(commands.setMenuLabels(labels));

/** Subscribes to menu items chosen in the menu bar. Returns the unsubscribe function. */
export const onMenuAction = events.menuActionEvent.listen;

/** Reads the validated durable workspace, preserving damaged data for recovery. */
export const loadWorkspace = () => result(commands.loadWorkspace());
/** Replaces the durable workspace with a revision-ordered snapshot. */
export const saveWorkspace = (request: SaveWorkspaceRequest) =>
  result(commands.saveWorkspace(request));

/** Restarts the native application after an explicit recovery request. */
export const restartApplication = () => result(commands.restartApplication());

/**
 * Tells the backend a close request reached the interface, so it does not
 * presume the interface hung and destroy the window before the session is saved.
 */
export const acknowledgeShutdown = () => result(commands.acknowledgeShutdown());
