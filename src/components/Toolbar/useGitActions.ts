import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import type { CheckoutOutcome, DirtyPath } from "../../bindings";
import {
  checkoutBranch,
  pullFastForward,
  pushCurrentBranch,
} from "../../lib/ipc";

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
  const [notice, setNotice] = useState<Notice | null>(null);
  const [blocked, setBlocked] = useState<BlockedCheckout | null>(null);
  const [confirmingPush, setConfirmingPush] = useState(false);

  const refresh = () => queryClient.invalidateQueries();
  const requirePath = (): string => {
    if (repositoryPath === null) throw new Error("No repository is open");
    return repositoryPath;
  };
  const fail = (error: Error) => {
    setNotice({ tone: "error", text: error.message });
  };

  const checkout = useMutation({
    mutationFn: ({ branch, force }: { branch: string; force: boolean }) =>
      checkoutBranch(requirePath(), branch, force),
    onSuccess: (outcome: CheckoutOutcome, variables) => {
      if (outcome.kind === "Blocked") {
        setBlocked({ branch: variables.branch, conflicts: outcome.conflicts });
        return;
      }
      setBlocked(null);
      setNotice({ tone: "info", text: `En ${outcome.branch}.` });
      void refresh();
    },
    onError: fail,
  });

  const pull = useMutation({
    mutationFn: () => pullFastForward(requirePath()),
    onSuccess: (outcome) => {
      switch (outcome.kind) {
        case "UpToDate":
          setNotice({ tone: "info", text: "Ya está al día." });
          break;
        case "FastForwarded":
          setNotice({
            tone: "info",
            text: `Avanzó ${String(outcome.commits)} commits.`,
          });
          void refresh();
          break;
        case "DivergedRequiresMerge":
          setNotice({
            tone: "error",
            text: `${outcome.local} y ${outcome.remote} divergieron. Hace falta un merge, que se resuelve desde la línea de comandos.`,
          });
          break;
        case "NoUpstream":
          setNotice({
            tone: "error",
            text: "Esta rama no tiene upstream configurado.",
          });
          break;
      }
    },
    onError: fail,
  });

  const push = useMutation({
    mutationFn: () => pushCurrentBranch(requirePath()),
    onSuccess: (outcome) => {
      if (outcome.kind === "RejectedNonFastForward") {
        setNotice({
          tone: "error",
          text: `El remoto rechazó el push de ${outcome.branch}: tiene commits que no están acá. Tráelos con pull antes de hacer push.`,
        });
        return;
      }
      setNotice({
        tone: "info",
        text: `${outcome.branch} enviada a ${outcome.remote}.`,
      });
      void refresh();
    },
    onError: fail,
  });

  const busy = checkout.isPending || pull.isPending || push.isPending;

  return {
    busy,
    pulling: pull.isPending,
    pushing: push.isPending,
    notice,
    confirmingPush,
    blocked,
    pull: () => {
      pull.mutate();
    },
    requestPush: () => {
      setConfirmingPush(true);
    },
    confirmPush: () => {
      setConfirmingPush(false);
      push.mutate();
    },
    cancelPush: () => {
      setConfirmingPush(false);
    },
    checkout: (branch) => {
      if (busy) return;
      setNotice(null);
      checkout.mutate({ branch, force: false });
    },
    confirmDiscardAndCheckout: () => {
      if (blocked === null) return;
      const { branch } = blocked;
      setBlocked(null);
      checkout.mutate({ branch, force: true });
    },
    cancelBlocked: () => {
      setBlocked(null);
    },
  };
}
