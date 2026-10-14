import { useTranslation } from "react-i18next";
import { openRepository } from "../../lib/ipc";
import { useWorkspace, tabOf } from "../../state/workspace";
import { ErrorMessage } from "../ErrorMessage";
import { useOpenFolder } from "./useOpenFolder";

/** A remembered project remains available to retry, relocate or close. */
export function UnreachableProject({
  root,
  error,
  retry,
}: {
  readonly root: string;
  readonly error: unknown;
  readonly retry: () => void;
}) {
  const { t } = useTranslation(["shell", "common"]);
  const folder = useOpenFolder(async (path) => {
    const source = tabOf(useWorkspace.getState(), root);
    const info = await openRepository(path);
    // The picker may outlive the tab it was opened for.
    if (tabOf(useWorkspace.getState(), root) === source)
      useWorkspace.getState().relocate(root, info);
  });
  return (
    <main
      className="app-shell__recovery"
      aria-label={t("workspace.unreachable")}
    >
      <h1>{t("workspace.unreachable")}</h1>
      <p className="app-shell__recovery-path">{root}</p>
      <ErrorMessage error={error} />
      <div className="app-shell__empty-actions">
        <button
          type="button"
          className="button button--primary"
          onClick={retry}
        >
          {t("common:actions.retry")}
        </button>
        <button
          type="button"
          className="button"
          disabled={folder.phase !== "idle"}
          onClick={folder.choose}
        >
          {t("workspace.locate")}
        </button>
        <button
          type="button"
          className="button"
          onClick={() => {
            useWorkspace.getState().closeTab(root);
          }}
        >
          {t("common:actions.close")}
        </button>
      </div>
      {folder.error !== null && (
        <div role="alert">
          <ErrorMessage error={folder.error.cause} />
        </div>
      )}
    </main>
  );
}
