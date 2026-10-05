/**
 * Shared geometry for the history table and graph, which draw in one scroll
 * container and therefore must derive row and lane coordinates together.
 */

/** Height of one commit row, in CSS pixels. Matches DESIGN.md. */
export const ROW_HEIGHT = 40;
/** Horizontal distance between two lanes, in CSS pixels. */
export const LANE_WIDTH = 14;
/** Left offset of lane 0's centre, in CSS pixels. */
const LANE_ORIGIN_X = 16;
/** Rows rendered above and below the viewport. */
export const OVERSCAN = 12;

/** Inclusive virtualized row range and full scroll height shared with the graph. */
export interface VisibleWindow {
  readonly startIndex: number;
  readonly endIndex: number;
  readonly totalHeight: number;
}

/** Centre of a lane, in CSS pixels from the left edge of the graph column. */
export function laneCenterX(lane: number): number {
  return LANE_ORIGIN_X + lane * LANE_WIDTH;
}

/** Centre of a row, in CSS pixels from the top of the scrolled content. */
export function rowCenterY(index: number): number {
  return index * ROW_HEIGHT + ROW_HEIGHT / 2;
}

/** Width the graph column needs, leaving padding after its last lane. */
export function graphWidth(maxLanes: number): number {
  return laneCenterX(Math.max(maxLanes, 1)) + LANE_ORIGIN_X;
}
