/** Typed application boundary over the generated Rust contract. */
import { commands, events } from "../../bindings";
import type { AppError, DiffRequest, HistoryRequest } from "../../bindings";

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
  DiffOmission,
  DiffRequest,
  FileChange,
  FileDiff,
  AppError,
  BranchInfo,
  CommitInfo,
  HistoryPage,
  HistoryRequest,
  RepositoryInfo,
  TagInfo,
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
