/** Fixed high-contrast colors on the GitCanvas #10131a graph surface. */
export const LANE_PALETTE = [
  "#f0a63e",
  "#4fd1c5",
  "#b39df3",
  "#73b7ff",
  "#f58ba8",
  "#b2d77c",
  "#e6c76b",
  "#c5b8a6",
] as const;

/** Maps a nonnegative integral lane to a stable color, cycling the fixed palette. */
export function laneColor(lane: number): string {
  if (!Number.isSafeInteger(lane) || lane < 0) {
    throw new RangeError("Lane index must be a nonnegative safe integer");
  }
  return LANE_PALETTE[lane % LANE_PALETTE.length] ?? LANE_PALETTE[0];
}
