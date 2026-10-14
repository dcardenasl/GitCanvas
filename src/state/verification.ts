/**
 * Whether what is known about a project's folder has been checked lately.
 *
 * A project can be shown from what was remembered about it — restored from the
 * last run, or left in the background while the folder changed — so before it
 * is used again it is checked: it is still a repository, it is still where it
 * was, and what is cached about it still matches the folder.
 */
export type Verification =
  /** Remembered, not yet checked: restored from the last run. */
  | { readonly status: "unverified" }
  /** The check is in progress. */
  | { readonly status: "verifying" }
  /** The folder was checked and matches what is held. */
  | { readonly status: "verified" }
  /** The folder could not be opened as the project it was. */
  | { readonly status: "unreachable"; readonly error: unknown };

/** A project that was just opened: the open itself was the check. */
export const VERIFIED: Verification = { status: "verified" };

/** A project remembered from the last run. */
export const UNVERIFIED: Verification = { status: "unverified" };

/** A check in progress. */
export const VERIFYING: Verification = { status: "verifying" };
