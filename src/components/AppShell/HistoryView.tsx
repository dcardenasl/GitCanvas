import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { CommitTable } from "../CommitTable";
import { ErrorMessage } from "../ErrorMessage";
import { GraphCanvas } from "../GraphCanvas";
import type { HistoryData } from "../../state/history";
import { useRefsByCommit } from "../../state/refs";
import { selectedCommitId as getSelectedCommitId } from "../../state/navigation";
import {
  useActiveRepository,
  useNavigation,
  useNavigationActions,
} from "../../state/workspace";
import { useWorktreeSnapshot } from "../../state/worktree";
import { DiffStat } from "../DiffStat/DiffStat";

/**
 * The history pane: the virtualized table with the graph drawn over it.
 *
 * The history arrives as a prop. The shell needs the same commits for search
 * and selection, so it loads them once and shares them; loading them here too
 * would lay the whole graph out a second time on every page.
 */
export function HistoryView({ history }: { readonly history: HistoryData }) {
  const { t } = useTranslation(["history", "common"]);
  const repository = useActiveRepository();
  const selection = useNavigation((navigation) => navigation.selection);
  const selectedCommitId = useNavigation(getSelectedCommitId);

  const { selectCommit, selectFile, clearReveal, clearOrphanedReveal } =
    useNavigationActions();
  const revealCommitId = useNavigation(
    (navigation) => navigation.revealCommitId,
  );

  const refsByCommit = useRefsByCommit(repository?.path ?? null);
  const local = useWorktreeSnapshot(repository?.path ?? null);

  const { commits, hasNextPage, isFetchingNextPage, fetchNextPage } = history;
  const loaded =
    revealCommitId === null || history.commitIndexById.has(revealCommitId);

  const localRow =
    local.data !== undefined &&
    local.error === null &&
    (local.data.staged.files.length > 0 ||
      local.data.unstaged.files.length > 0) ? (
      <button
        type="button"
        className={
          selection.kind === "history"
            ? "working-tree-row working-tree-row--selected"
            : "working-tree-row"
        }
        aria-pressed={selection.kind === "history"}
        onClick={() => {
          selectFile(null);
          selectCommit(null);
        }}
      >
        <span className="working-tree-row__marker" aria-hidden="true">
          WIP
        </span>
        <span className="working-tree-row__title">{t("localRow.title")}</span>
        <span className="working-tree-row__summary">
          {t("localRow.summary", {
            staged: local.data.staged.total_files,
            unstaged: local.data.unstaged.total_files,
          })}
        </span>
        <span className="working-tree-row__stats">
          <DiffStat
            insertions={
              local.data.staged.insertions + local.data.unstaged.insertions
            }
            deletions={
              local.data.staged.deletions + local.data.unstaged.deletions
            }
          />
        </span>
      </button>
    ) : null;
  const localState =
    local.error !== null ? (
      <div className="state history-view__state" role="alert">
        <ErrorMessage error={local.error} lead={t("localRow.readFailed")} />
      </div>
    ) : null;

  useEffect(() => {
    // The commit being revealed may be deeper than what is loaded — an old
    // branch tip, for instance. Keep pulling pages until it turns up or the
    // history runs out; `hasNextPage` is what makes this terminate rather than
    // an arbitrary page cap that could stop just short of the answer.
    if (loaded || !hasNextPage || isFetchingNextPage || history.error !== null)
      return;
    fetchNextPage();
  }, [loaded, hasNextPage, isFetchingNextPage, history.error, fetchNextPage]);

  useEffect(() => {
    // The whole history was walked and the commit is not in it. Give up rather
    // than leave a request pending forever against a ref that cannot be shown.
    if (revealCommitId !== null && !loaded && !hasNextPage) {
      clearOrphanedReveal();
    }
  }, [revealCommitId, loaded, hasNextPage, clearOrphanedReveal]);

  if (history.error !== null && commits.length === 0) {
    return (
      <div className="history-view">
        {localRow}
        {localState}
        <div className="state history-view__state" role="alert">
          <ErrorMessage error={history.error} />
        </div>
      </div>
    );
  }

  if (history.isLoading) {
    return (
      <div className="history-view">
        {localRow}
        {localState}
        <p className="state history-view__state">{t("state.loading")}</p>
      </div>
    );
  }

  if (commits.length === 0) {
    return (
      <div className="history-view">
        {localRow}
        {localState}
        <p className="state history-view__state">{t("state.empty")}</p>
      </div>
    );
  }

  return (
    <div className="history-view">
      {localRow}
      {localState}
      {history.error !== null && (
        <div className="state history-view__state" role="alert">
          <ErrorMessage
            error={history.error}
            lead={t("state.nextPageFailed")}
          />{" "}
          <button
            type="button"
            className="button"
            disabled={isFetchingNextPage}
            onClick={fetchNextPage}
          >
            {t("common:actions.retry")}
          </button>
        </div>
      )}
      <CommitTable
        commits={commits}
        commitIndexById={history.commitIndexById}
        selectedId={selectedCommitId}
        onSelect={selectCommit}
        maxLanes={history.maxLanes}
        onReachEnd={fetchNextPage}
        revealCommitId={revealCommitId}
        onRevealed={clearReveal}
        refsByCommit={refsByCommit}
        renderGraph={(window) => (
          <GraphCanvas
            rows={history.rows}
            window={window}
            maxLanes={history.maxLanes}
            selectedId={selectedCommitId}
          />
        )}
      />
    </div>
  );
}
