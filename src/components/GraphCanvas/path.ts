import type { GraphRow } from "../../lib/graph-layout/types";
import { ROW_HEIGHT, laneCenterX, rowCenterY } from "../../lib/historyGeometry";

/**
 * SVG path for one outgoing edge.
 *
 * Every edge occupies the bottom half of its row: it starts at the node centre
 * and ends on the boundary with the next row, where the following row's
 * incoming segment picks it up as a straight vertical. Because no edge ever
 * spans more than one row, drawing only the visible rows is exact rather than
 * an approximation — nothing can be cut in half.
 *
 * A lane change is drawn as a cubic Bézier whose control points sit on the
 * vertical, so the curve leaves and arrives travelling downward and reads as
 * one continuous line rather than a diagonal.
 */
export function edgePath(index: number, from: number, to: number): string {
  const startX = laneCenterX(from);
  const startY = rowCenterY(index);
  const endX = laneCenterX(to);
  const endY = (index + 1) * ROW_HEIGHT;

  if (from === to) {
    return `M${String(startX)},${String(startY)} L${String(endX)},${String(endY)}`;
  }

  const midY = (startY + endY) / 2;
  return (
    `M${String(startX)},${String(startY)} ` +
    `C${String(startX)},${String(midY)} ` +
    `${String(endX)},${String(midY)} ` +
    `${String(endX)},${String(endY)}`
  );
}

/**
 * SVG path for one incoming lane.
 *
 * The top half routes incoming trajectories into the actual commit node.
 * Pass-through trajectories stay vertical.
 */
export function incomingPath(
  index: number,
  from: number,
  to: number = from,
): string {
  const x1 = laneCenterX(from);
  const x2 = laneCenterX(to);
  const y1 = index * ROW_HEIGHT;
  const y2 = rowCenterY(index);
  if (from === to)
    return `M${String(x1)},${String(y1)} L${String(x2)},${String(y2)}`;
  const mid = (y1 + y2) / 2;
  return `M${String(x1)},${String(y1)} C${String(x1)},${String(mid)} ${String(x2)},${String(mid)} ${String(x2)},${String(y2)}`;
}

/** Half of a node-to-node cubic, split at t=0.5 with de Casteljau's rule. */
function adjacentPath(
  index: number,
  from: number,
  to: number,
  incoming: boolean,
): string {
  const x1 = laneCenterX(from);
  const x2 = laneCenterX(to);
  const y = rowCenterY(index);
  const half = ROW_HEIGHT / 2;
  const middle = (x1 + x2) / 2;
  if (from === to)
    return incoming ? incomingPath(index + 1, to) : edgePath(index, from, to);
  return incoming
    ? `M${String(middle)},${String(y + half)} C${String((x1 + 3 * x2) / 4)},${String(y + half * 1.25)} ${String(x2)},${String(y + half * 1.5)} ${String(x2)},${String(y + ROW_HEIGHT)}`
    : `M${String(x1)},${String(y)} C${String(x1)},${String(y + half / 2)} ${String((3 * x1 + x2) / 4)},${String(y + half * 0.75)} ${String(middle)},${String(y + half)}`;
}

/** Whether the intermediate lane overshoots both endpoint lanes. */
function hasDetour(from: number, through: number, to: number): boolean {
  return through < Math.min(from, to) || through > Math.max(from, to);
}

/** One visible half-row path, retaining its semantic trajectory color. */
export interface ConnectionSegment {
  readonly key: string;
  readonly trajectory: string;
  readonly path: string;
}

/**
 * Routes adjacent commits directly, bypassing temporary layout lanes. A pending
 * trajectory still owns its lane until its destination arrives; only an edge
 * whose destination is the very next node can skip an overshooting lane.
 * Ordinary forks and joins retain their compact half-row curves.
 * Both halves consult the same boundary, including outside the mounted window.
 */
export function connectionSegments(
  row: GraphRow,
  previous: GraphRow | undefined,
  next: GraphRow | undefined,
): readonly ConnectionSegment[] {
  const preceding = new Map(previous?.outgoing.map((edge) => [edge.to, edge]));
  const following = new Map(next?.incoming.map((edge) => [edge.from, edge]));
  return [
    ...row.incoming.map((edge, index) => {
      const source = preceding.get(edge.from);
      const direct =
        edge.to === row.lane &&
        source !== undefined &&
        source.from === previous?.lane &&
        source.trajectory === edge.trajectory &&
        hasDetour(source.from, edge.from, edge.to);
      return {
        key: `${row.id}:in:${String(index)}`,
        trajectory: edge.trajectory,
        path: direct
          ? adjacentPath(row.index - 1, source.from, edge.to, true)
          : incomingPath(row.index, edge.from, edge.to),
      };
    }),
    ...row.outgoing.map((edge, index) => {
      const destination = following.get(edge.to);
      const direct =
        edge.from === row.lane &&
        destination !== undefined &&
        destination.to === next?.lane &&
        destination.trajectory === edge.trajectory &&
        hasDetour(edge.from, edge.to, destination.to);
      return {
        key: `${row.id}:out:${String(index)}`,
        trajectory: edge.trajectory,
        path: direct
          ? adjacentPath(row.index, edge.from, destination.to, false)
          : edgePath(row.index, edge.from, edge.to),
      };
    }),
  ];
}
