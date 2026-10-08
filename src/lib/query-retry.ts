import { errorKind } from "./errors";
import { IpcError } from "./ipc";

/** How many times a transient failure is retried before it is reported. */
const MAX_RETRIES = 3;

/**
 * Whether a failed query should be tried again.
 *
 * Reading git is local and deterministic, so a failure is normally real and
 * retrying only delays the message. The exception is the process running out
 * of file descriptors, which clears as other work releases its handles; the
 * backend says so with a typed error, so no message text is inspected here.
 */
export function shouldRetryQuery(
  failureCount: number,
  error: unknown,
): boolean {
  return (
    error instanceof IpcError &&
    error.kind === "ResourceExhausted" &&
    failureCount < MAX_RETRIES
  );
}

/** Backoff between retries: 100 ms, 200 ms, 400 ms, capped at one second. */
export function queryRetryDelay(attemptIndex: number): number {
  return Math.min(100 * 2 ** attemptIndex, 1000);
}

/**
 * Retry policy for reads of the local changes.
 *
 * On top of descriptor exhaustion, a listing torn by an edit that landed while
 * it was being read (`WorktreeChanged`) is worth reading again: a second read
 * sees a settled tree. A snapshot that gave up on the first tear would leave the
 * view on the previous revision until something else happened to change.
 */
export function shouldRetryLocalRead(
  failureCount: number,
  error: unknown,
): boolean {
  return (
    shouldRetryQuery(failureCount, error) ||
    (errorKind(error) === "WorktreeChanged" && failureCount < MAX_RETRIES)
  );
}
