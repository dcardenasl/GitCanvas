import type { AppError } from "../bindings";
import { i18n } from "../i18n";

/**
 * Every backend failure kind the interface introduces by category.
 *
 * A `Record` over every kind: adding a variant to `AppError` in Rust fails the
 * type check here until it is listed, and the `errors:kind.*` catalog keys are
 * typed from the same names, so it also fails until the base catalog has a
 * summary for it.
 */
const APP_ERROR_KINDS: Record<AppError["kind"], true> = {
  InvalidRepository: true,
  Io: true,
  Git: true,
  Auth: true,
  Network: true,
  Conflict: true,
  InvalidInput: true,
  PathOutsideRepository: true,
  WorktreeChanged: true,
  WorktreeFileUnavailable: true,
  ResourceLimitExceeded: true,
  WatchDegraded: true,
  StaleCursor: true,
  ResourceExhausted: true,
  Internal: true,
};

/** A failure as the backend reports it: a category and an English diagnostic. */
export interface StructuredError {
  readonly kind: AppError["kind"];
  readonly message: string;
}

/** An error ready to show: a translated summary and the original diagnostic. */
export interface ErrorDescription {
  /** What kind of failure it was, in the interface language. */
  readonly summary: string;
  /**
   * The backend's own English diagnostic, for whoever needs the precise cause.
   * `null` when there is nothing beyond the summary.
   */
  readonly detail: string | null;
}

/** Whether a value is one of the backend's known, user-facing error kinds. */
export function isAppErrorKind(kind: unknown): kind is AppError["kind"] {
  return (
    typeof kind === "string" &&
    Object.prototype.hasOwnProperty.call(APP_ERROR_KINDS, kind)
  );
}

/** The backend error category of `error`, if it came from the backend. */
export function errorKind(error: unknown): AppError["kind"] | null {
  if (!(error instanceof Error) || !("kind" in error)) return null;
  return isAppErrorKind(error.kind) ? error.kind : null;
}

/** Whether a value carries a backend error's category and diagnostic. */
function isStructuredError(error: unknown): error is StructuredError {
  return (
    typeof error === "object" &&
    error !== null &&
    "kind" in error &&
    "message" in error &&
    isAppErrorKind(error.kind) &&
    typeof error.message === "string"
  );
}

/**
 * How to introduce a failure of any origin.
 *
 * Backend errors carry a `kind`; React translates that category and the
 * backend's English diagnostic is kept apart as the detail, never mixed into
 * the sentence. Anything else is an error the code raised for itself, whose
 * message is already a diagnostic, and is shown as it is. Recognised by shape
 * rather than by class so this module does not depend on the IPC layer it
 * describes.
 */
export function describeError(error: unknown): ErrorDescription {
  if (isStructuredError(error)) {
    return {
      summary: i18n.t(`errors:kind.${error.kind}`),
      detail: error.message === "" ? null : error.message,
    };
  }
  // A `kind` this build does not know is a backend newer than the interface;
  // its message is not for display, so it gets the generic sentence.
  if (error instanceof Error && !("kind" in error)) {
    return { summary: error.message, detail: null };
  }
  return { summary: i18n.t("errors:unknown"), detail: null };
}
