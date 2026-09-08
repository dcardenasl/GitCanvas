import { expect, it } from "vitest";
import { laneColor, LANE_PALETTE } from "./colors";

it("assigns exact stable colors and cycles at the palette boundary", () => {
  expect([laneColor(0), laneColor(1), laneColor(2)]).toEqual([
    "#f0a63e",
    "#4fd1c5",
    "#b39df3",
  ]);
  expect(laneColor(8)).toBe(laneColor(0));
  for (let lane = 0; lane < 100; lane += 1) {
    expect(laneColor(lane)).toBe(LANE_PALETTE[lane % LANE_PALETTE.length]);
  }
});

it("rejects invalid indices", () => {
  for (const lane of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    expect(() => laneColor(lane)).toThrow(RangeError);
  }
});

function luminance(hex: string): number {
  const linear = [1, 3, 5].map((offset) => {
    const channel = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return (
    (linear[0] ?? 0) * 0.2126 +
    (linear[1] ?? 0) * 0.7152 +
    (linear[2] ?? 0) * 0.0722
  );
}

it("maintains at least 4.5:1 contrast for nodes, lines and labels on the graph", () => {
  const surface = luminance("#10131a");
  for (const color of LANE_PALETTE) {
    expect((luminance(color) + 0.05) / (surface + 0.05)).toBeGreaterThanOrEqual(
      4.5,
    );
  }
});
