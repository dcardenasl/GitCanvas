import { Suspense } from "react";
import { useTranslation } from "react-i18next";

import { useFileHistory } from "../../state/fileHistory";
import type { HistoryData } from "../../state/history";
import {
  useActiveRepository,
  useNavigation,
  useNavigationActions,
} from "../../state/workspace";
import { LazyFileDiffView } from "../FileDiffView/lazy";

import "./FileHistoryView.css";

/**
 * The centre of a file's history: the file's change in the commit that is
 * picked, against its first parent. With nothing picked it shows the newest
 * commit, so the view is never empty while the history has rows.
 */
export function FileHistoryDiff({
  history,
}: {
  readonly history: HistoryData;
}) {
  const { t } = useTranslation(["fileHistory", "common"]);
  const root = useActiveRepository()?.path ?? null;
  const view = useNavigation((navigation) => navigation.fileHistory);
  const actions = useNavigationActions();
  const file = useFileHistory(root, view);

  if (root === null || view === null) return null;
  if (file.isLoading) {
    return (
      <p className="state" role="status">
        {t("loading")}
      </p>
    );
  }

  const shownId = view.selectedCommitId ?? file.rows[0]?.commit.id ?? null;
  const shown = file.rows.find((row) => row.commit.id === shownId) ?? null;
  if (shown === null) {
    return <p className="state">{t("empty")}</p>;
  }

  const inGraph = history.commitIndexById.has(shown.commit.id);
  return (
    <div className="file-history-diff">
      {!inGraph && (
        <p className="file-history__notice" role="note">
          {t("outsideScope")}
        </p>
      )}
      <Suspense
        fallback={
          <p className="state" role="status">
            {t("loading")}
          </p>
        }
      >
        <LazyFileDiffView
          embedded
          repositoryPath={root}
          commit={shown.commit}
          path={shown.path_at_commit}
          actions={
            inGraph ? (
              <button
                type="button"
                className="button"
                onClick={() => {
                  actions.closeFileHistory();
                  actions.revealCommit(shown.commit.id);
                }}
              >
                {t("showInGraph")}
              </button>
            ) : null
          }
        />
      </Suspense>
    </div>
  );
}
