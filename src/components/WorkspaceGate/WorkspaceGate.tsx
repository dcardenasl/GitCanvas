import { useQuery } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { getWorkspaceLimits } from "../../lib/ipc";
import { queryKeys } from "../../state/queryKeys";
import { useWorkspace } from "../../state/workspace";
import { ErrorMessage } from "../ErrorMessage";

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
    queryFn: getWorkspaceLimits,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (limits.data !== undefined) setLimits(limits.data);
  }, [limits.data, setLimits]);

  if (known) return children;

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
