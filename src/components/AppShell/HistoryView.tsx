import { useEffect } from "react";

import { userMessage } from "../../lib/errors";
import { CommitTable } from "../CommitTable";
import { GraphCanvas } from "../GraphCanvas";
import type { HistoryData } from "../../state/history";
import { useRefsByCommit } from "../../state/refs";
import {
  selectedCommitId as getSelectedCommitId,
  useSession,
} from "../../state/session";
import { useWorktreeSnapshot } from "../../state/worktree";

/**
 * The history pane: the virtualized table with the graph drawn over it.
 *
 * The history arrives as a prop. The shell needs the same commits for search
 * and selection, so it loads them once and shares them; loading them here too
 * would lay the whole graph out a second time on every page.
 */
export function HistoryView({ history }: { readonly history: HistoryData }) {
  const repository = useSession((state) => state.repository);
  const selection = useSession((state) => state.selection);
  const selectedCommitId = useSession(getSelectedCommitId);
  const selectCommit = useSession((state) => state.selectCommit);
  const selectFile = useSession((state) => state.selectFile);
  const revealCommitId = useSession((state) => state.revealCommitId);
  const clearReveal = useSession((state) => state.clearReveal);

  const refsByCommit = useRefsByCommit(repository?.path ?? null);
  const local = useWorktreeSnapshot(repository?.path ?? null);

  const { commits, hasNextPage, isFetchingNextPage, fetchNextPage } = history;
  const loaded =
    revealCommitId === null ||
    commits.some((commit) => commit.id === revealCommitId);

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
        <span className="working-tree-row__title">Cambios locales</span>
        <span className="working-tree-row__summary">
          {local.data.staged.total_files} preparados ·{" "}
          {local.data.unstaged.total_files} sin preparar
        </span>
        <span className="working-tree-row__stats">
          <span className="detail-panel__stat-add">
            +{local.data.staged.insertions + local.data.unstaged.insertions}
          </span>{" "}
          <span className="detail-panel__stat-del">
            −{local.data.staged.deletions + local.data.unstaged.deletions}
          </span>
        </span>
      </button>
    ) : null;
  const localState =
    local.error !== null ? (
      <p className="history-view__state" role="alert">
        No se pudieron leer los cambios locales: {userMessage(local.error)}
      </p>
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
    if (revealCommitId !== null && !loaded && !hasNextPage) clearReveal();
  }, [revealCommitId, loaded, hasNextPage, clearReveal]);

  if (history.error !== null && commits.length === 0) {
    return (
      <div className="history-view">
        {localRow}
        {localState}
        <p className="history-view__state" role="alert">
          {userMessage(history.error)}
        </p>
      </div>
    );
  }

  if (history.isLoading) {
    return (
      <div className="history-view">
        {localRow}
        {localState}
        <p className="history-view__state">Leyendo el historial…</p>
      </div>
    );
  }

  if (commits.length === 0) {
    return (
      <div className="history-view">
        {localRow}
        {localState}
        <p className="history-view__state">
          Este repositorio no tiene commits.
        </p>
      </div>
    );
  }

  return (
    <div className="history-view">
      {localRow}
      {localState}
      {history.error !== null && (
        <p className="history-view__state" role="alert">
          No se pudo cargar la siguiente página: {userMessage(history.error)}{" "}
          <button
            type="button"
            className="button"
            disabled={isFetchingNextPage}
            onClick={fetchNextPage}
          >
            Reintentar
          </button>
        </p>
      )}
      <CommitTable
        commits={commits}
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
