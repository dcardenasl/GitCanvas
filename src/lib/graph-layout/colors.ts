/** High-contrast lane colors paired by position across the two themes. */
export const LANE_PALETTES = {
  dark: [
    "#f0a63e",
    "#4fd1c5",
    "#b39df3",
    "#73b7ff",
    "#f58ba8",
    "#b2d77c",
    "#e6c76b",
    "#c5b8a6",
  ],
  light: [
    "#9a5700",
    "#007b72",
    "#6941a5",
    "#1763a5",
    "#b04461",
    "#4d751c",
    "#8a6510",
    "#68523c",
  ],
} as const;

/** Maps a nonnegative integral lane to a stable color, cycling the fixed palette. */
export function laneColor(
  lane: number,
  theme: "dark" | "light" = "dark",
): string {
  if (!Number.isSafeInteger(lane) || lane < 0) {
    throw new RangeError("Lane index must be a nonnegative safe integer");
  }
  const palette = LANE_PALETTES[theme];
  return palette[lane % palette.length] ?? palette[0];
}
