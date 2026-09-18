/** Typed application boundary over the generated Rust contract. */
import { commands, events } from "../../bindings";
import type {
  AppError,
  DiffRequest,
  CommitTreeRequest,
  FileContentRequest,
  HistoryRequest,
  WorktreeFileDiffRequest,
  WorktreeFileContentRequest,
  WorktreeSnapshotRequest,
  WatchRequest,
} from "../../bindings";

export type {
  AppInfo,
  CheckoutOutcome,
  DirtyPath,
  PullOutcome,
  PushOutcome,
  CacheEntry,
  CacheStatus,
  ClonedRepository,
  CloneProgressEvent,
  GitHubAccount,
  GitHubRepository,
  CommitDiff,
  CommitTreeEntry,
  CommitTreeEntryKind,
  CommitTreePage,
  CommitTreeRequest,
  DiffOmission,
  DiffRequest,
  FileChange,
  FileContent,
  FileContentRequest,
  FileDiff,
  AppError,
  BranchInfo,
  CommitInfo,
  HistoryPage,
  HistoryRequest,
  RepositoryChangedEvent,
  RepositoryInfo,
  TagInfo,
  WorktreeDiffPage,
  WorktreeFileDiff,
  WorktreeFileDiffRequest,
  WorktreeFileContent,
  WorktreeFileContentRequest,
  WorktreeFingerprint,
  WorktreeSnapshot,
  WorktreeSnapshotRequest,
  WatchRequest,
  RepositoryChangedKind,
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

/** Reports application and engine versions. */
export const ping = commands.ping;
/** Opens a validated repository and returns its canonical identity. */
export const openRepository = (path: string) =>
  result(commands.openRepository(path));
/** The repository named on the command line, if there was one. */
export const getStartupRepository = () =>
  result(commands.getStartupRepository());
/** Validates a repository candidate without changing the UI selection. */
export const validateRepository = (path: string) =>
  result(commands.validateRepository(path));
/** Reads the next bounded history page from its original snapshot. */
export const getCommits = (path: string, request: HistoryRequest) =>
  result(commands.getCommits(path, request));
/** Lists local and remote branches. */
export const getBranches = (path: string) => result(commands.getBranches(path));
/** Lists lightweight and annotated tags. */
export const getTags = (path: string) => result(commands.getTags(path));
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
export const cloneGithubRepository = (cloneUrl: string, fullName: string) =>
  result(commands.cloneGithubRepository(cloneUrl, fullName));
/** Reports what the clone cache holds and the limits it is held to. */
export const getCloneCacheStatus = () => result(commands.getCloneCacheStatus());

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

/** Starts watching the open repository, replacing any previous watch. */
export const watchRepository = (request: WatchRequest) =>
  result(commands.watchRepository(request));
/** Stops watching the generation that requested the cleanup. */
export const unwatchRepository = (generation: number) =>
  result(commands.unwatchRepository(generation));

/** Subscribes to repository changes. Returns the unsubscribe function. */
export const onRepositoryChanged = events.repositoryChangedEvent.listen;
