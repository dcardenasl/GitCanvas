import { ROW_HEIGHT, laneCenterX, rowCenterY } from "../CommitTable/geometry";

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
 * The top half of a row is always a straight vertical, because the layout
 * resolves every lane change in the half-row above it.
 */
export function incomingPath(index: number, lane: number): string {
  const x = laneCenterX(lane);
  return `M${String(x)},${String(index * ROW_HEIGHT)} L${String(x)},${String(rowCenterY(index))}`;
}
