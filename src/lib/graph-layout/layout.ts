import type {
  GraphCommit,
  GraphRow,
  LaneEdge,
  LayoutResult,
  LayoutState,
} from "./types";

/**
 * Extends a topologically ordered Git stream without rewriting earlier rows.
 * First parents continue their lane unless another child already reserved them.
 * A reservation remains live across page boundaries until its commit arrives.
 * Inputs and prior state are never mutated. Malformed page order is rejected.
 */
export function layout(
  commits: readonly GraphCommit[],
  previous?: LayoutState,
): LayoutResult {
  const lanes = [...(previous?.lanes ?? [])];
  const reservations = new Map<string, number>();
  for (const [lane, id] of lanes.entries()) {
    if (id === null) continue;
    if (reservations.has(id)) throw new Error("Duplicate lane reservation");
    reservations.set(id, lane);
  }
  const rowCount = previous?.rowCount ?? 0;
  let maxLanes = previous?.maxLanes ?? 0;
  const seen = new Set<string>();
  const rows: GraphRow[] = [];

  const reserve = (id: string): number => {
    const existing = reservations.get(id);
    if (existing !== undefined) return existing;
    const vacant = lanes.indexOf(null);
    const lane = vacant < 0 ? lanes.length : vacant;
    lanes[lane] = id;
    reservations.set(id, lane);
    return lane;
  };

  for (const commit of commits) {
    if (commit.id.length === 0 || seen.has(commit.id)) {
      throw new Error("Commit IDs must be nonempty and unique within a page");
    }
    seen.add(commit.id);
    for (const parent of commit.parents) {
      if (parent.length === 0 || seen.has(parent)) {
        throw new Error(
          "Parents must follow their children in topological order",
        );
      }
    }
    const incoming = lanes.flatMap((id, lane) => (id === null ? [] : [lane]));
    const lane = reserve(commit.id);
    lanes[lane] = null;
    reservations.delete(commit.id);
    const outgoing: LaneEdge[] = lanes.flatMap((id, index) =>
      id === null ? [] : [{ from: index, to: index, colorLane: index }],
    );

    for (const [parentIndex, parent] of [
      ...new Set(commit.parents),
    ].entries()) {
      if (parentIndex === 0 && !reservations.has(parent)) {
        // The first parent inherits the node lane even if a lower lane is free.
        lanes[lane] = parent;
        reservations.set(parent, lane);
      }
      const target = reserve(parent);
      outgoing.push({ from: lane, to: target, colorLane: target });
    }
    maxLanes = Math.max(maxLanes, lanes.length, lane + 1);
    rows.push({
      id: commit.id,
      index: rowCount + rows.length,
      lane,
      incoming,
      outgoing,
    });
    while (lanes.length > 0 && lanes.at(-1) === null) lanes.pop();
  }

  return { rows, state: { lanes, rowCount: rowCount + rows.length, maxLanes } };
}
