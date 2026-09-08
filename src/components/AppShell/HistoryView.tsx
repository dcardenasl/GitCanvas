import { useEffect } from "react";

import { CommitTable } from "../CommitTable";
import { GraphCanvas } from "../GraphCanvas";
import { useHistory } from "../../state/history";
import { useSession } from "../../state/session";

/** The history pane: the virtualized table with the graph drawn over it. */
export function HistoryView() {
  const repository = useSession((state) => state.repository);
  const selectedCommitId = useSession((state) => state.selectedCommitId);
  const selectCommit = useSession((state) => state.selectCommit);
  const revealCommitId = useSession((state) => state.revealCommitId);
  const clearReveal = useSession((state) => state.clearReveal);

  const history = useHistory(repository?.path ?? null);

  const { commits, hasNextPage, isFetchingNextPage, fetchNextPage } = history;
  const loaded =
    revealCommitId === null ||
    commits.some((commit) => commit.id === revealCommitId);

  useEffect(() => {
    // The commit being revealed may be deeper than what is loaded — an old
    // branch tip, for instance. Keep pulling pages until it turns up or the
    // history runs out; `hasNextPage` is what makes this terminate rather than
    // an arbitrary page cap that could stop just short of the answer.
    if (loaded || !hasNextPage || isFetchingNextPage) return;
    fetchNextPage();
  }, [loaded, hasNextPage, isFetchingNextPage, fetchNextPage]);

  useEffect(() => {
    // The whole history was walked and the commit is not in it. Give up rather
    // than leave a request pending forever against a ref that cannot be shown.
    if (revealCommitId !== null && !loaded && !hasNextPage) clearReveal();
  }, [revealCommitId, loaded, hasNextPage, clearReveal]);

  if (history.error !== null) {
    return (
      <p className="history-view__state" role="alert">
        {history.error.message}
      </p>
    );
  }

  if (history.isLoading) {
    return <p className="history-view__state">Leyendo el historial…</p>;
  }

  if (commits.length === 0) {
    return (
      <p className="history-view__state">Este repositorio no tiene commits.</p>
    );
  }

  return (
    <CommitTable
      commits={commits}
      selectedId={selectedCommitId}
      onSelect={selectCommit}
      maxLanes={history.maxLanes}
      onReachEnd={fetchNextPage}
      revealCommitId={revealCommitId}
      onRevealed={clearReveal}
      renderGraph={(window) => (
        <GraphCanvas
          rows={history.rows}
          window={window}
          maxLanes={history.maxLanes}
          selectedId={selectedCommitId}
        />
      )}
    />
  );
}
