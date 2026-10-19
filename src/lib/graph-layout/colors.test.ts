import { expect, it } from "vitest";
import { graphColor, GRAPH_COLORS } from "./colors";

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
  ["dark", "#211d2d"],
  ["light", "#eee6fa"],
] as const)("maintains 4.5:1 lane contrast on the %s theme", (theme, hex) => {
  const surface = luminance(hex);
  for (const id of GRAPH_COLORS) {
    const color = graphColor(id, theme);
    const contrast =
      (Math.max(luminance(color), surface) + 0.05) /
      (Math.min(luminance(color), surface) + 0.05);
    expect(contrast).toBeGreaterThanOrEqual(4.5);
  }
});
