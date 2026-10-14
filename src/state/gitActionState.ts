import type { DirtyPath } from "../bindings";

/**
 * What an action left to say, as a code and its parameters.
 *
 * Never a sentence: the text is composed when the notice is rendered, so a
 * notice already on screen follows a change of language instead of freezing in
 * the one that was active when the action finished.
 */
export type NoticeContent =
  | { readonly code: "checkedOut"; readonly branch: string }
  | { readonly code: "upToDate" }
  | { readonly code: "fastForwarded"; readonly commits: number }
  | {
      readonly code: "diverged";
      readonly local: string;
      readonly remote: string;
    }
  | { readonly code: "noUpstream" }
  | { readonly code: "pushRejected"; readonly branch: string }
  | {
      readonly code: "pushed";
      readonly branch: string;
      readonly remote: string;
    }
  | { readonly code: "failed"; readonly error: unknown };

/** What the last action left for the user to read. */
export interface Notice {
  readonly tone: "info" | "error";
  readonly content: NoticeContent;
}

/** A checkout the backend refused because it would discard work. */
export interface BlockedCheckout {
  readonly branch: string;
  readonly conflicts: readonly DirtyPath[];
}

/** The actions that change a repository or its remote. */
export type RunningAction = "checkout" | "pull" | "push";

/**
 * Checkout, pull and push for one project, and the state around them.
 *
 * It belongs to the project's tab, not to whatever view happens to be showing
 * it: an action started in one project keeps running, and reports into that
 * project, while another is on screen.
 */
export interface GitActionState {
  /** The action in flight, if any; a second one must wait for it. */
  readonly running: RunningAction | null;
  /** What the last action left to read. */
  readonly notice: Notice | null;
  /** A checkout waiting for the person to accept discarding local changes. */
  readonly blocked: BlockedCheckout | null;
  /** Whether a push is waiting for the person's explicit confirmation. */
  readonly confirmingPush: boolean;
}

/** A project nothing has been done in. */
export const IDLE_GIT_ACTIONS: GitActionState = {
  running: null,
  notice: null,
  blocked: null,
  confirmingPush: false,
};

/** A change to a project's git action state. */
export type GitTransition = (state: GitActionState) => GitActionState;
