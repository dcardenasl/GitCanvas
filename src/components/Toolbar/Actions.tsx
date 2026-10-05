import { ConfirmDialog } from "./ConfirmDialog";
import type { GitActions } from "./useGitActions";

import "./Actions.css";

/** Git operations and current branch displayed by the action controls. */
export interface ActionsProps {
  readonly actions: GitActions;
  readonly currentBranch: string | null;
}

/** Pull and push buttons, and the confirmations and notices every action uses. */
export function Actions({ actions, currentBranch }: ActionsProps) {
  const { notice, blocked, busy } = actions;

  return (
    <>
      <button
        type="button"
        className="button"
        disabled={busy}
        onClick={actions.pull}
      >
        {actions.pulling ? "Trayendo…" : "Traer cambios"}
      </button>
      <button
        type="button"
        className="button"
        disabled={busy || currentBranch === null}
        onClick={actions.requestPush}
      >
        {actions.pushing ? "Enviando…" : "Enviar cambios"}
      </button>

      {notice !== null && (
        <div
          className={
            notice.tone === "error"
              ? "actions__notice actions__notice--error"
              : "actions__notice"
          }
          role={notice.tone === "error" ? "alert" : "status"}
        >
          <span>{notice.text}</span>
          <button
            type="button"
            className="actions__notice-close"
            aria-label="Cerrar aviso"
            onClick={actions.clearNotice}
          >
            ×
          </button>
        </div>
      )}

      {actions.confirmingPush && currentBranch !== null && (
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
          onCancel={actions.cancelPush}
          onConfirm={actions.confirmPush}
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
          onCancel={actions.cancelBlocked}
          onConfirm={actions.confirmDiscardAndCheckout}
        />
      )}
    </>
  );
}
