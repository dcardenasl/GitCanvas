import { CommitTable } from "../CommitTable";
import { GraphCanvas } from "../GraphCanvas";
import { useHistory } from "../../state/history";
import { useSession } from "../../state/session";

/** The history pane: the virtualized table with the graph drawn over it. */
export function HistoryView() {
  const repository = useSession((state) => state.repository);
  const selectedCommitId = useSession((state) => state.selectedCommitId);
  const selectCommit = useSession((state) => state.selectCommit);

  const history = useHistory(repository?.path ?? null);

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

  if (history.commits.length === 0) {
    return (
      <p className="history-view__state">Este repositorio no tiene commits.</p>
    );
  }

  return (
    <CommitTable
      commits={history.commits}
      selectedId={selectedCommitId}
      onSelect={selectCommit}
      maxLanes={history.maxLanes}
      onReachEnd={history.fetchNextPage}
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
