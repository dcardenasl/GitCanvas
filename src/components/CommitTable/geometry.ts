/**
 * Shared geometry for the history view.
 *
 * The commit table and the graph layer draw into the same scroll container, so
 * both derive every coordinate from these constants. Duplicating a row height
 * between the two is exactly how a graph ends up half a pixel out of step with
 * its rows on some zoom level.
 */

/** Height of one commit row, in CSS pixels. Matches DESIGN.md. */
export const ROW_HEIGHT = 40;

/** Horizontal distance between two lanes, in CSS pixels. */
export const LANE_WIDTH = 14;

/** Left offset of lane 0's centre, in CSS pixels. */
export const LANE_ORIGIN_X = 16;

/** Rows rendered above and below the viewport, to cover fast scrolling. */
export const OVERSCAN = 12;

/** Centre of a lane, in CSS pixels from the left edge of the graph column. */
export function laneCenterX(lane: number): number {
  return LANE_ORIGIN_X + lane * LANE_WIDTH;
}

/** Centre of a row, in CSS pixels from the top of the scrolled content. */
export function rowCenterY(index: number): number {
  return index * ROW_HEIGHT + ROW_HEIGHT / 2;
}

/**
 * Width the graph column needs for a given number of lanes.
 *
 * Always leaves one lane of padding on the right so a node drawn in the last
 * lane is not clipped by the column edge.
 */
export function graphWidth(maxLanes: number): number {
  return laneCenterX(Math.max(maxLanes, 1)) + LANE_ORIGIN_X;
}
