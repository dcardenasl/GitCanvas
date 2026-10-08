import { expect, it } from "vitest";
import { laneColor, LANE_PALETTES } from "./colors";

it("assigns stable colors by theme and cycles at the palette boundary", () => {
  expect([laneColor(0), laneColor(1), laneColor(2)]).toEqual([
    "#f0a63e",
    "#4fd1c5",
    "#b39df3",
  ]);
  expect(laneColor(0, "light")).toBe("#9a5700");
  expect(laneColor(8)).toBe(laneColor(0));
  expect(laneColor(8, "light")).toBe(laneColor(0, "light"));
  for (let lane = 0; lane < 100; lane += 1) {
    expect(laneColor(lane)).toBe(
      LANE_PALETTES.dark[lane % LANE_PALETTES.dark.length],
    );
    expect(laneColor(lane, "light")).toBe(
      LANE_PALETTES.light[lane % LANE_PALETTES.light.length],
    );
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

it.each([
  ["dark", "#10131a"],
  ["light", "#f7f6f3"],
] as const)("maintains 4.5:1 lane contrast on the %s theme", (theme, hex) => {
  const surface = luminance(hex);
  for (const color of LANE_PALETTES[theme]) {
    const contrast =
      (Math.max(luminance(color), surface) + 0.05) /
      (Math.min(luminance(color), surface) + 0.05);
    expect(contrast).toBeGreaterThanOrEqual(4.5);
  }
});
