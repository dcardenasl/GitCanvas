import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";

import { CommitTable } from "../CommitTable";
import { ErrorMessage } from "../ErrorMessage";
import { GraphCanvas } from "../GraphCanvas";
import type { HistoryData } from "../../state/history";
import type { StashAnchorEntry } from "../../bindings";
import { useGraphModel } from "../../state/graph";
import { useRefsByCommit } from "../../state/refs";
import { selectedCommitId as getSelectedCommitId } from "../../state/navigation";
import {
  useActiveRepository,
  useNavigation,
  useNavigationActions,
  useWorkspace,
} from "../../state/workspace";
import { useWorktreeSnapshot } from "../../state/worktree";
import { DiffStat } from "../DiffStat/DiffStat";
import { useStashAnchors } from "../../state/stashes";

const NO_EXCLUSIONS: readonly string[] = [];

/**
 * The history pane: the virtualized table with the graph drawn over it.
 *
 * The history arrives as a prop. The shell needs the same commits for search
 * and selection, so it loads them once and shares them; loading them here too
 * would lay the whole graph out a second time on every page.
 */
export function HistoryView({ history }: { readonly history: HistoryData }) {
  const { t } = useTranslation(["history", "common", "stash"]);
  const repository = useActiveRepository();
  const selection = useNavigation((navigation) => navigation.selection);
  const selectedCommitId = useNavigation(getSelectedCommitId);

  const {
    selectCommit,
    selectFile,
    clearReveal,
    clearOrphanedReveal,
    setHistoryAnchor,
    openStash,
  } = useNavigationActions();
  const historyAnchor = useNavigation((navigation) => navigation.historyAnchor);
  const revealCommitId = useNavigation(
    (navigation) => navigation.revealCommitId,
  );

  const graph = useGraphModel(repository?.path ?? null);
  const changeReferenceFilters = useWorkspace(
    (state) => state.changeReferenceFilters,
  );
  const excludedReferences = useWorkspace(
    (state) =>
      state.referenceFilters.find((entry) => entry.path === repository?.path)
        ?.excluded ?? NO_EXCLUSIONS,
  );
  const refsByCommit = useRefsByCommit(repository?.path ?? null);
  const local = useWorktreeSnapshot(repository?.path ?? null);
  const stashAnchors = useStashAnchors(repository?.path ?? null);
  const stashView = useNavigation((navigation) => navigation.stash);
  const visibleStashesByBase = useMemo(() => {
    const groups = new Map<string, StashAnchorEntry[]>();
    for (const anchor of stashAnchors.data?.entries ?? []) {
      if (!history.commitIndexById.has(anchor.base_commit_id)) continue;
      const group = groups.get(anchor.base_commit_id) ?? [];
      group.push(anchor);
      groups.set(anchor.base_commit_id, group);
    }
    return groups;
  }, [history.commitIndexById, stashAnchors.data]);

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
    const filtersAreEmpty =
      graph.refs.data !== undefined && excludedReferences.length > 0;
    return (
      <div className="history-view">
        {localRow}
        {localState}
        <p className="state history-view__state">
          {filtersAreEmpty ? t("state.filteredEmpty") : t("state.empty")}
        </p>
        {filtersAreEmpty && repository !== null && (
          <button
            type="button"
            className="button"
            onClick={() => {
              changeReferenceFilters(repository.path, []);
            }}
          >
            {t("state.showAll")}
          </button>
        )}
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
      {stashAnchors.error !== null && (
        <div className="state history-view__state" role="status">
          <span>{t("stash:graph.refreshFailed")}</span>{" "}
          <button
            type="button"
            className="button"
            disabled={stashAnchors.isFetching}
            onClick={() => void stashAnchors.refetch()}
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
        anchorCommitId={historyAnchor}
        onAnchorChange={setHistoryAnchor}
        refsByCommit={refsByCommit}
        stashesByBase={visibleStashesByBase}
        activeStashId={stashView?.entry.stash_id ?? null}
        onSelectStash={openStash}
        renderGraph={(window) => (
          <GraphCanvas
            colors={graph.colors}
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
