import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import { checkoutBranch, pullFastForward, pushCurrentBranch } from "../lib/ipc";
import {
  IDLE_GIT_ACTIONS,
  type BlockedCheckout,
  type GitActionState,
  type GitTransition,
  type Notice,
  type RunningAction,
} from "./gitActionState";
import { invalidateLive } from "./queryKeys";
import { gitActionsOf, tabOf, useWorkspace } from "./workspace";

/** Checkout, pull and push for one project, and the state around them. */
export interface GitActions {
  /**
   * Whether an action must not start: one is running, or the project has not
   * been verified since it was last on screen.
   */
  readonly busy: boolean;
  readonly pulling: boolean;
  readonly pushing: boolean;
  readonly notice: Notice | null;
  readonly clearNotice: () => void;
  readonly confirmingPush: boolean;
  readonly blocked: BlockedCheckout | null;
  pull: () => void;
  requestPush: () => void;
  confirmPush: () => void;
  cancelPush: () => void;
  /** Switches branch, asking first if work would be lost. */
  checkout: (branch: string) => void;
  /** Switches branch discarding local changes; only after the user confirmed. */
  confirmDiscardAndCheckout: () => void;
  cancelBlocked: () => void;
}

/** What an action's outcome does to the state, and whether it moved the repository. */
interface Settled {
  readonly transition: GitTransition;
  /** Whether history or the working tree may have changed. */
  readonly refresh: boolean;
}

function info(content: Notice["content"]): GitTransition {
  return (state) => ({ ...state, notice: { tone: "info", content } });
}

function problem(content: Notice["content"]): GitTransition {
  return (state) => ({ ...state, notice: { tone: "error", content } });
}

/**
 * Runs one action against the project with `root` and records what happened in
 * that project's own state.
 *
 * Every write goes through here, so the rules are in one place: nothing starts
 * while another action of the same project is running, the running mark is
 * always cleared however the call ends, and the result lands on the project
 * that asked for it even when another one is on screen by then.
 */
async function run<Outcome>(
  root: string,
  queryClient: QueryClient,
  kind: RunningAction,
  start: GitTransition,
  call: () => Promise<Outcome>,
  settle: (outcome: Outcome) => Settled,
): Promise<void> {
  // Not open, or already busy: either way there is nothing to start.
  if (gitActionsOf(useWorkspace.getState(), root)?.running !== null) return;

  const update = (transition: GitTransition) => {
    useWorkspace.getState().updateGitActions(root, transition);
  };
  update((state) => start({ ...state, running: kind }));

  try {
    const settled = settle(await call());
    update((state) => ({ ...settled.transition(state), running: null }));
    if (settled.refresh) void invalidateLive(queryClient, root);
  } catch (error) {
    update((state) => ({
      ...problem({ code: "failed", error })(state),
      running: null,
    }));
  }
}

/** The commands for the project with `root`, bound to it. */
export function createGitActionCommands(
  root: string,
  queryClient: QueryClient,
): Omit<
  GitActions,
  "busy" | "pulling" | "pushing" | "notice" | "confirmingPush" | "blocked"
> {
  const update = (transition: GitTransition) => {
    useWorkspace.getState().updateGitActions(root, transition);
  };
  const checkout = (branch: string, force: boolean, start: GitTransition) =>
    run(
      root,
      queryClient,
      "checkout",
      start,
      () => checkoutBranch(root, branch, force),
      (outcome): Settled =>
        outcome.kind === "Blocked"
          ? {
              transition: (state) => ({
                ...state,
                blocked: { branch, conflicts: outcome.conflicts },
              }),
              refresh: false,
            }
          : {
              transition: (state) => ({
                ...info({ code: "checkedOut", branch: outcome.branch })(state),
                blocked: null,
              }),
              refresh: true,
            },
    );
  const push = () =>
    run(
      root,
      queryClient,
      "push",
      (state) => ({ ...state, confirmingPush: false }),
      () => pushCurrentBranch(root),
      (outcome): Settled =>
        outcome.kind === "RejectedNonFastForward"
          ? {
              transition: problem({
                code: "pushRejected",
                branch: outcome.branch,
              }),
              refresh: false,
            }
          : {
              transition: info({
                code: "pushed",
                branch: outcome.branch,
                remote: outcome.remote,
              }),
              refresh: true,
            },
    );

  return {
    clearNotice: () => {
      update((state) => ({ ...state, notice: null }));
    },
    pull: () => {
      void run(
        root,
        queryClient,
        "pull",
        (state) => state,
        () => pullFastForward(root),
        (outcome): Settled => {
          switch (outcome.kind) {
            case "UpToDate":
              return { transition: info({ code: "upToDate" }), refresh: false };
            case "FastForwarded":
              return {
                transition: info({
                  code: "fastForwarded",
                  commits: outcome.commits,
                }),
                refresh: true,
              };
            case "DivergedRequiresMerge":
              return {
                transition: problem({
                  code: "diverged",
                  local: outcome.local,
                  remote: outcome.remote,
                }),
                refresh: false,
              };
            case "NoUpstream":
              return {
                transition: problem({ code: "noUpstream" }),
                refresh: false,
              };
          }
        },
      );
    },
    requestPush: () => {
      update((state) => ({ ...state, confirmingPush: true }));
    },
    confirmPush: () => {
      void push();
    },
    cancelPush: () => {
      update((state) => ({ ...state, confirmingPush: false }));
    },
    checkout: (branch) => {
      void checkout(branch, false, (state) => ({ ...state, notice: null }));
    },
    confirmDiscardAndCheckout: () => {
      const blocked = gitActionsOf(useWorkspace.getState(), root)?.blocked;
      if (blocked === null || blocked === undefined) return;
      void checkout(blocked.branch, true, (state) => ({
        ...state,
        blocked: null,
      }));
    },
    cancelBlocked: () => {
      update((state) => ({ ...state, blocked: null }));
    },
  };
}

/**
 * The git actions of the project with `path`, as that project's tab holds them.
 *
 * One instance is shared by everything that can start an action — the toolbar
 * buttons and the branch list — so they see the same busy state and the same
 * confirmation dialogs, and two actions of one project can never run at once.
 * Another project's actions are its own: they neither show here nor block it.
 */
export function useGitActions(path: string | null): GitActions {
  const queryClient = useQueryClient();
  const tab = useWorkspace((workspace) =>
    path === null ? null : tabOf(workspace, path),
  );
  const state: GitActionState = tab?.gitActions ?? IDLE_GIT_ACTIONS;
  const commands = useMemo(
    () =>
      path === null ? NO_COMMANDS : createGitActionCommands(path, queryClient),
    [path, queryClient],
  );

  return {
    // A project that has not been checked since it was last on screen is not
    // written to: what the buttons would act on may no longer be there.
    busy: state.running !== null || tab?.verification.status !== "verified",
    pulling: state.running === "pull",
    pushing: state.running === "push",
    notice: state.notice,
    confirmingPush: state.confirmingPush,
    blocked: state.blocked,
    ...commands,
  };
}

const NO_COMMANDS: ReturnType<typeof createGitActionCommands> = {
  clearNotice: () => undefined,
  pull: () => undefined,
  requestPush: () => undefined,
  confirmPush: () => undefined,
  cancelPush: () => undefined,
  checkout: () => undefined,
  confirmDiscardAndCheckout: () => undefined,
  cancelBlocked: () => undefined,
};
