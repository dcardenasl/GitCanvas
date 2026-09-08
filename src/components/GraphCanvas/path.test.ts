import { describe, expect, it } from "vitest";

import { ROW_HEIGHT, laneCenterX, rowCenterY } from "../CommitTable/geometry";

import { edgePath, incomingPath } from "./path";

/** Extracts every coordinate pair from an SVG path string. */
function points(d: string): [number, number][] {
  return [...d.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map((m) => [
    Number(m[1]),
    Number(m[2]),
  ]);
}

describe("edgePath", () => {
  it("draws a straight line when the lane does not change", () => {
    const d = edgePath(3, 2, 2);
    expect(d.startsWith("M")).toBe(true);
    expect(d).toContain("L");
    expect(d).not.toContain("C");
  });

  it("draws a curve when the lane changes", () => {
    expect(edgePath(3, 0, 2)).toContain("C");
  });

  it("starts at the node centre and ends on the next row boundary", () => {
    const coords = points(edgePath(3, 1, 4));
    const start = coords[0];
    const end = coords[coords.length - 1];

    expect(start).toEqual([laneCenterX(1), rowCenterY(3)]);
    expect(end).toEqual([laneCenterX(4), 4 * ROW_HEIGHT]);
  });

  it("meets the next row's incoming segment exactly", () => {
    // The whole reason a visible window can be drawn without cutting a line:
    // where one row's edge ends, the next row's incoming segment begins.
    const outgoing = points(edgePath(7, 0, 3));
    const incoming = points(incomingPath(8, 3));

    expect(outgoing[outgoing.length - 1]).toEqual(incoming[0]);
  });

  it("leaves and arrives travelling vertically", () => {
    // Control points share the x of their endpoint, so the curve reads as one
    // continuous line rather than a diagonal.
    const [start, c1, c2, end] = points(edgePath(2, 1, 3));

    expect(c1?.[0]).toBe(start?.[0]);
    expect(c2?.[0]).toBe(end?.[0]);
  });
});

describe("incomingPath", () => {
  it("spans the top half of its row in a single lane", () => {
    const coords = points(incomingPath(5, 2));

    expect(coords[0]).toEqual([laneCenterX(2), 5 * ROW_HEIGHT]);
    expect(coords[1]).toEqual([laneCenterX(2), rowCenterY(5)]);
  });
});
