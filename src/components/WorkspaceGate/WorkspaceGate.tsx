import { useQuery } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { getWorkspaceLimits, loadWorkspace, IpcError } from "../../lib/ipc";
import { useWorkspaceLifecycle } from "../../state/workspaceLifecycle";
import { queryKeys } from "../../state/queryKeys";
import { useWorkspace } from "../../state/workspace";
import { ErrorMessage } from "../ErrorMessage";
import "./WorkspaceGate.css";

function WorkspaceRuntime({ children }: { readonly children: ReactNode }) {
  const { t } = useTranslation(["shell", "common"]);
  const persistence = useWorkspaceLifecycle();
  const failure = useWorkspace((state) => state.storageError);
  const dismiss = useWorkspace((state) => state.dismissStorageError);
  return (
    <div className="workspace-runtime">
      {failure !== null && (
        <div role="alert" className="workspace-runtime__error">
          <ErrorMessage
            error={failure.cause}
            lead={t(
              failure.kind === "recovery"
                ? "workspace.recovered"
                : "workspace.saveFailed",
            )}
          />
          {failure.kind === "save" && (
            <button
              className="button"
              type="button"
              onClick={persistence.retry}
            >
              {t("common:actions.retry")}
            </button>
          )}
          <button className="button" type="button" onClick={dismiss}>
            {t("workspace.dismiss")}
          </button>
        </div>
      )}
      {children}
    </div>
  );
}

/**
 * Holds the interface back until the workspace knows its bounds.
 *
 * The bounds come from the backend, which enforces them, so the interface never
 * keeps a second copy that could disagree. Nothing can be opened before they
 * are known, which is a moment long enough to be invisible and short enough not
 * to need more than a line of text.
 */
export function WorkspaceGate({ children }: { readonly children: ReactNode }) {
  const { t } = useTranslation(["shell", "common"]);
  const known = useWorkspace((state) => state.limits !== null);
  const setLimits = useWorkspace((state) => state.setLimits);
  const limits = useQuery({
    queryKey: queryKeys.workspaceLimits(),
    queryFn: async () => {
      const [bounds, loaded] = await Promise.all([
        getWorkspaceLimits(),
        loadWorkspace().then(
          (value) => ({ value, error: null }),
          (error: unknown) => ({ value: null, error }),
        ),
      ]);
      return { bounds, loaded };
    },
    staleTime: Infinity,
  });

  useEffect(() => {
    if (limits.data === undefined || useWorkspace.getState().limits !== null)
      return;
    const { bounds, loaded } = limits.data;
    if (loaded.value !== null) {
      useWorkspace.getState().restore(loaded.value.workspace);
      if (loaded.value.recovery !== null) {
        useWorkspace.getState().setStorageError(
          new IpcError({
            kind: "InvalidInput",
            message: `${loaded.value.recovery.detail} (${loaded.value.recovery.backup})`,
          }),
          "recovery",
        );
      }
    } else useWorkspace.getState().setStorageError(loaded.error, "recovery");
    setLimits(bounds);
  }, [limits.data, setLimits]);

  if (known) return <WorkspaceRuntime>{children}</WorkspaceRuntime>;

  if (limits.isError) {
    return (
      <div className="state state--error" role="alert">
        <ErrorMessage error={limits.error} lead={t("startup.failed")} />
        <button
          type="button"
          className="button"
          onClick={() => {
            void limits.refetch();
          }}
        >
          {t("common:actions.retry")}
        </button>
      </div>
    );
  }

  return (
    <p className="state" role="status">
      {t("startup.loading")}
    </p>
  );
}
