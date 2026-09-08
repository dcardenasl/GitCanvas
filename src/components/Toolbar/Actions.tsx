import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import type { CheckoutOutcome, DirtyPath } from "../../bindings";
import {
  checkoutBranch,
  pullFastForward,
  pushCurrentBranch,
} from "../../lib/ipc";

import { ConfirmDialog } from "./ConfirmDialog";

import "./Actions.css";

export interface ActionsProps {
  readonly repositoryPath: string;
  readonly currentBranch: string | null;
}

/** What the last action left for the user to read. */
interface Notice {
  readonly tone: "info" | "error";
  readonly text: string;
}

/** Checkout, pull and push, with confirmation before anything destructive. */
export function Actions({ repositoryPath, currentBranch }: ActionsProps) {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [blocked, setBlocked] = useState<{
    branch: string;
    conflicts: DirtyPath[];
  } | null>(null);
  const [confirmPush, setConfirmPush] = useState(false);

  const refresh = () => queryClient.invalidateQueries();

  const checkout = useMutation({
    mutationFn: ({ branch, force }: { branch: string; force: boolean }) =>
      checkoutBranch(repositoryPath, branch, force),
    onSuccess: (outcome: CheckoutOutcome, variables) => {
      if (outcome.kind === "Blocked") {
        setBlocked({ branch: variables.branch, conflicts: outcome.conflicts });
        return;
      }
      setBlocked(null);
      setNotice({ tone: "info", text: `En ${outcome.branch}.` });
      void refresh();
    },
    onError: (error: Error) => {
      setNotice({ tone: "error", text: error.message });
    },
  });

  const pull = useMutation({
    mutationFn: () => pullFastForward(repositoryPath),
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
    onError: (error: Error) => {
      setNotice({ tone: "error", text: error.message });
    },
  });

  const push = useMutation({
    mutationFn: () => pushCurrentBranch(repositoryPath),
    onSuccess: (outcome) => {
      if (outcome.kind === "RejectedNonFastForward") {
        setNotice({
          tone: "error",
          text: `El remoto rechazó el push de ${outcome.branch}: tiene commits que no están acá. Traelos con pull antes de pushear.`,
        });
        return;
      }
      setNotice({
        tone: "info",
        text: `${outcome.branch} enviada a ${outcome.remote}.`,
      });
      void refresh();
    },
    onError: (error: Error) => {
      setNotice({ tone: "error", text: error.message });
    },
  });

  const busy = checkout.isPending || pull.isPending || push.isPending;

  return (
    <>
      <button
        type="button"
        className="button"
        disabled={busy}
        onClick={() => {
          pull.mutate();
        }}
      >
        {pull.isPending ? "Pull…" : "Pull"}
      </button>
      <button
        type="button"
        className="button"
        disabled={busy || currentBranch === null}
        onClick={() => {
          setConfirmPush(true);
        }}
      >
        {push.isPending ? "Push…" : "Push"}
      </button>

      {notice !== null && (
        <p
          className={
            notice.tone === "error"
              ? "actions__notice actions__notice--error"
              : "actions__notice"
          }
          role={notice.tone === "error" ? "alert" : "status"}
        >
          {notice.text}
        </p>
      )}

      {confirmPush && currentBranch !== null && (
        <ConfirmDialog
          title="Enviar cambios"
          body={
            <p>
              Se van a enviar los commits de <strong>{currentBranch}</strong> al
              remoto. Esto es visible para cualquiera que tenga acceso al
              repositorio.
            </p>
          }
          confirmLabel="Enviar"
          onCancel={() => {
            setConfirmPush(false);
          }}
          onConfirm={() => {
            setConfirmPush(false);
            push.mutate();
          }}
        />
      )}

      {blocked !== null && (
        <ConfirmDialog
          title="Hay cambios sin guardar"
          destructive
          body={
            <>
              <p>
                Cambiar a <strong>{blocked.branch}</strong> descartaría estos
                cambios, que no están commiteados:
              </p>
              <ul className="actions__conflicts">
                {blocked.conflicts.slice(0, 10).map((conflict) => (
                  <li key={conflict.path}>
                    {conflict.path}
                    {conflict.staged && (
                      <span className="actions__staged"> · en el índice</span>
                    )}
                  </li>
                ))}
                {blocked.conflicts.length > 10 && (
                  <li>y {blocked.conflicts.length - 10} más</li>
                )}
              </ul>
              <p>Esto no se puede deshacer.</p>
            </>
          }
          confirmLabel="Descartar y cambiar"
          onCancel={() => {
            setBlocked(null);
          }}
          onConfirm={() => {
            const branch = blocked.branch;
            setBlocked(null);
            checkout.mutate({ branch, force: true });
          }}
        />
      )}
    </>
  );
}
