import type { GraphContext } from "./context";
import type {
  GraphCommit,
  GraphRow,
  LaneEdge,
  LayoutResult,
  LayoutState,
} from "./types";

/** No configured references is useful for detached/tag-only synthetic histories. */
export const EMPTY_GRAPH_CONTEXT: GraphContext = { principal: null, seeds: [] };

/**
 * Resumes a topological stream without rewriting earlier rows. First parents
 * retain trajectory identity; additional parents start independent paths. Even
 * connections to the same future SHA stay separate until that SHA's node.
 */
export function layout(
  commits: readonly GraphCommit[],
  previous?: LayoutState,
  context: GraphContext = EMPTY_GRAPH_CONTEXT,
): LayoutResult {
  const lanes = [...(previous?.lanes ?? [])];
  const rows: GraphRow[] = [];
  const rowCount = previous?.rowCount ?? 0;
  let maxLanes = previous?.maxLanes ?? 0;
  const known = new Set(context.seeds.map((seed) => seed.id));
  const seeds = new Map<string, string[]>();
  const compare = (a: string, b: string) => {
    const rank = (id: string) =>
      id === context.principal ? 0 : known.has(id) ? 1 : 2;
    return rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0);
  };
  for (const seed of context.seeds) {
    const group = seeds.get(seed.commitId) ?? [];
    group.push(seed.id);
    seeds.set(seed.commitId, group);
  }
  const allocate = (trajectory: string): number => {
    if (
      trajectory === context.principal &&
      (lanes[0] === null || lanes[0] === undefined)
    )
      return 0;
    const start = context.principal === null ? 0 : 1;
    for (let lane = start; lane < lanes.length; lane += 1)
      if (lanes[lane] === null) return lane;
    return Math.max(start, lanes.length);
  };
  const seen = new Set<string>();
  for (const commit of commits) {
    if (commit.id.length === 0 || seen.has(commit.id))
      throw new Error("Commit IDs must be nonempty and unique within a page");
    seen.add(commit.id);
    const parents = [...new Set(commit.parents)];
    for (const parent of parents)
      if (parent.length === 0 || seen.has(parent))
        throw new Error(
          "Parents must follow their children in topological order",
        );
    const matching: number[] = [];
    const candidates = [...(seeds.get(commit.id) ?? [])];
    for (const [lane, pending] of lanes.entries()) {
      if (pending?.target === commit.id) {
        matching.push(lane);
        candidates.push(pending.trajectory);
      }
    }
    const trajectory = candidates.sort(compare)[0] ?? `root:${commit.id}`;
    const chosenLane = matching.find(
      (lane) => lanes[lane]?.trajectory === trajectory,
    );
    const lane =
      trajectory === context.principal
        ? 0
        : (chosenLane ?? matching[0] ?? allocate(trajectory));
    const incoming: LaneEdge[] = [];
    for (const [from, pending] of lanes.entries()) {
      if (pending === null) continue;
      incoming.push({
        from,
        to: pending.target === commit.id ? lane : from,
        trajectory: pending.trajectory,
      });
    }
    for (const matched of matching) lanes[matched] = null;
    const outgoing: LaneEdge[] = [];
    for (const [from, pending] of lanes.entries())
      if (pending !== null)
        outgoing.push({ from, to: from, trajectory: pending.trajectory });
    for (const [index, target] of parents.entries()) {
      const sideCandidates = seeds.get(target) ?? [];
      const nextTrajectory =
        index === 0
          ? trajectory
          : ([...sideCandidates].sort(compare)[0] ??
            `merge:${commit.id}:${String(index)}:${target}`);
      const to = index === 0 ? lane : allocate(nextTrajectory);
      while (lanes.length <= to) lanes.push(null);
      if (lanes[to] !== null)
        throw new Error("A trajectory cannot overwrite a live lane");
      lanes[to] = { target, trajectory: nextTrajectory };
      outgoing.push({ from: lane, to, trajectory: nextTrajectory });
    }
    maxLanes = Math.max(maxLanes, lane + 1, lanes.length);
    rows.push({
      id: commit.id,
      index: rowCount + rows.length,
      lane,
      trajectory,
      incoming,
      outgoing,
    });
    while (lanes.length > 0 && lanes.at(-1) === null) lanes.pop();
  }
  return { rows, state: { lanes, rowCount: rowCount + rows.length, maxLanes } };
}
