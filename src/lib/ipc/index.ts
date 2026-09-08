/** Typed application boundary over the generated Rust contract. */
import { commands } from "../../bindings";
import type { AppError, DiffRequest, HistoryRequest } from "../../bindings";

export type {
  AppInfo,
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
