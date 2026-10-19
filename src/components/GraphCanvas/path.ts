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
