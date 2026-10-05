import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLayoutEffect, useRef, useState } from "react";

import type { CheckoutOutcome, DirtyPath } from "../../bindings";
import { userMessage } from "../../lib/errors";
import {
  checkoutBranch,
  pullFastForward,
  pushCurrentBranch,
} from "../../lib/ipc";
import { invalidateLive } from "../../state/queryKeys";

/** What the last action left for the user to read. */
export interface Notice {
  readonly tone: "info" | "error";
  readonly text: string;
}

/** A checkout the backend refused because it would discard work. */
export interface BlockedCheckout {
  readonly branch: string;
  readonly conflicts: readonly DirtyPath[];
}

/** Checkout, pull and push for one repository, and the state around them. */
export interface GitActions {
  /** Whether any action is running; a second one must wait. */
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

/**
 * The git actions of the open repository.
 *
 * One instance is shared by everything that can start an action — the toolbar
 * buttons and the branch list — so they see the same busy state and the same
 * confirmation dialogs, and two actions can never run at once.
 */
export function useGitActions(repositoryPath: string | null): GitActions {
  const queryClient = useQueryClient();
  const [noticeState, setNoticeState] = useState<{
    readonly repositoryPath: string;
    readonly notice: Notice;
  } | null>(null);
  const [blocked, setBlocked] = useState<BlockedCheckout | null>(null);
  const [confirmingPush, setConfirmingPush] = useState(false);
  const [previousRepositoryPath, setPreviousRepositoryPath] =
    useState(repositoryPath);
  const currentRepositoryPath = useRef(repositoryPath);

  if (previousRepositoryPath !== repositoryPath) {
    setPreviousRepositoryPath(repositoryPath);
    setNoticeState(null);
    setBlocked(null);
    setConfirmingPush(false);
  }

  const notice =
    noticeState?.repositoryPath === repositoryPath ? noticeState.notice : null;
  const setNotice = (path: string, next: Notice) => {
    if (path !== currentRepositoryPath.current) return;
    setNoticeState({ repositoryPath: path, notice: next });
  };
  const refresh = (path: string) => invalidateLive(queryClient, path);
  const requirePath = (): string => {
    if (repositoryPath === null) throw new Error("No repository is open");
    return repositoryPath;
  };

  useLayoutEffect(() => {
    currentRepositoryPath.current = repositoryPath;
  }, [repositoryPath]);

  const fail = (error: Error, path: string) => {
    setNotice(path, { tone: "error", text: userMessage(error) });
  };

  const checkout = useMutation({
    mutationFn: ({
      path,
      branch,
      force,
    }: {
      path: string;
      branch: string;
      force: boolean;
    }) => checkoutBranch(path, branch, force),
    onSuccess: (outcome: CheckoutOutcome, variables) => {
      if (outcome.kind === "Blocked") {
        if (variables.path !== currentRepositoryPath.current) return;
        setBlocked({ branch: variables.branch, conflicts: outcome.conflicts });
        return;
      }
      setBlocked(null);
      setNotice(variables.path, {
        tone: "info",
        text: `En ${outcome.branch}.`,
      });
      void refresh(variables.path);
    },
    onError: (error, variables) => {
      fail(error, variables.path);
    },
  });

  const pull = useMutation({
    mutationFn: ({ path }: { path: string }) => pullFastForward(path),
    onSuccess: (outcome, variables) => {
      switch (outcome.kind) {
        case "UpToDate":
          setNotice(variables.path, { tone: "info", text: "Ya está al día." });
          break;
        case "FastForwarded": {
          const count = `${String(outcome.commits)} ${
            outcome.commits === 1 ? "commit" : "commits"
          }`;
          setNotice(variables.path, {
            tone: "info",
            text: `Avanzó ${count}.`,
          });
          void refresh(variables.path);
          break;
        }
        case "DivergedRequiresMerge":
          setNotice(variables.path, {
            tone: "error",
            text: `${outcome.local} y ${outcome.remote} divergieron. Hace falta un merge, que se resuelve desde la línea de comandos.`,
          });
          break;
        case "NoUpstream":
          setNotice(variables.path, {
            tone: "error",
            text: "Esta rama no tiene upstream configurado.",
          });
          break;
      }
    },
    onError: (error, variables) => {
      fail(error, variables.path);
    },
  });

  const push = useMutation({
    mutationFn: ({ path }: { path: string }) => pushCurrentBranch(path),
    onSuccess: (outcome, variables) => {
      if (outcome.kind === "RejectedNonFastForward") {
        setNotice(variables.path, {
          tone: "error",
          text: `El remoto rechazó el push de ${outcome.branch}: tiene commits que no están acá. Tráelos con pull antes de hacer push.`,
        });
        return;
      }
      setNotice(variables.path, {
        tone: "info",
        text: `${outcome.branch} enviada a ${outcome.remote}.`,
      });
      void refresh(variables.path);
    },
    onError: (error, variables) => {
      fail(error, variables.path);
    },
  });

  const busy = checkout.isPending || pull.isPending || push.isPending;

  return {
    busy,
    pulling: pull.isPending,
    pushing: push.isPending,
    notice,
    clearNotice: () => {
      setNoticeState(null);
    },
    confirmingPush,
    blocked,
    pull: () => {
      pull.mutate({ path: requirePath() });
    },
    requestPush: () => {
      setConfirmingPush(true);
    },
    confirmPush: () => {
      setConfirmingPush(false);
      push.mutate({ path: requirePath() });
    },
    cancelPush: () => {
      setConfirmingPush(false);
    },
    checkout: (branch) => {
      if (busy) return;
      setNoticeState(null);
      checkout.mutate({ path: requirePath(), branch, force: false });
    },
    confirmDiscardAndCheckout: () => {
      if (blocked === null) return;
      const { branch } = blocked;
      setBlocked(null);
      checkout.mutate({ path: requirePath(), branch, force: true });
    },
    cancelBlocked: () => {
      setBlocked(null);
    },
  };
}
