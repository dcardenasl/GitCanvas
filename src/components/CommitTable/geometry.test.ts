import { describe, expect, it } from "vitest";

import {
  LANE_WIDTH,
  ROW_HEIGHT,
  graphWidth,
  laneCenterX,
  rowCenterY,
} from "./geometry";

describe("geometry", () => {
  it("spaces lanes evenly from the origin", () => {
    expect(laneCenterX(1) - laneCenterX(0)).toBe(LANE_WIDTH);
    expect(laneCenterX(5) - laneCenterX(4)).toBe(LANE_WIDTH);
  });

  it("centres a row inside its own height", () => {
    expect(rowCenterY(0)).toBe(ROW_HEIGHT / 2);
    expect(rowCenterY(3) - rowCenterY(2)).toBe(ROW_HEIGHT);
  });

  it("leaves room so the last lane is not clipped", () => {
    expect(graphWidth(3)).toBeGreaterThan(laneCenterX(2));
  });

  it("reserves a lane of width even when nothing is drawn yet", () => {
    expect(graphWidth(0)).toBe(graphWidth(1));
  });
});
