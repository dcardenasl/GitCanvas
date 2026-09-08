// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { layout } from "../../lib/graph-layout/layout";
import type { GraphCommit } from "../../lib/graph-layout/types";
import { ROW_HEIGHT } from "../CommitTable/geometry";

import { GraphCanvas } from "./GraphCanvas";

afterEach(cleanup);

function linear(count: number): GraphCommit[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `c${String(index)}`,
    parents: index + 1 < count ? [`c${String(index + 1)}`] : [],
  }));
}

describe("GraphCanvas", () => {
  it("draws a node for every row in the window", () => {
    const { rows, state } = layout(linear(10));

    const { container } = render(
      <GraphCanvas
        rows={rows}
        window={{ startIndex: 0, endIndex: 9, totalHeight: 10 * ROW_HEIGHT }}
        maxLanes={state.maxLanes}
        selectedId={null}
      />,
    );

    expect(container.querySelectorAll("circle")).toHaveLength(10);
  });

  it("emits geometry only for the mounted rows, not the whole history", () => {
    const { rows, state } = layout(linear(5000));

    const { container } = render(
      <GraphCanvas
        rows={rows}
        window={{
          startIndex: 100,
          endIndex: 120,
          totalHeight: 5000 * ROW_HEIGHT,
        }}
        maxLanes={state.maxLanes}
        selectedId={null}
      />,
    );

    // The window is 21 rows, plus one on each side.
    expect(container.querySelectorAll("circle")).toHaveLength(23);
  });

  it("sizes the surface to the whole history so scrolling stays aligned", () => {
    const { rows, state } = layout(linear(500));
    const totalHeight = 500 * ROW_HEIGHT;

    const { container } = render(
      <GraphCanvas
        rows={rows}
        window={{ startIndex: 0, endIndex: 12, totalHeight }}
        maxLanes={state.maxLanes}
        selectedId={null}
      />,
    );

    expect(container.querySelector("svg")?.getAttribute("height")).toBe(
      String(totalHeight),
    );
  });

  it("draws the merge fork as a curve", () => {
    // c0 merges c1 and c2, so one of its outgoing edges changes lane.
    const { rows, state } = layout([
      { id: "c0", parents: ["c1", "c2"] },
      { id: "c1", parents: ["c3"] },
      { id: "c2", parents: ["c3"] },
      { id: "c3", parents: [] },
    ]);

    const { container } = render(
      <GraphCanvas
        rows={rows}
        window={{ startIndex: 0, endIndex: 3, totalHeight: 4 * ROW_HEIGHT }}
        maxLanes={state.maxLanes}
        selectedId={null}
      />,
    );

    const curves = [...container.querySelectorAll("path")].filter((p) =>
      p.getAttribute("d")?.includes("C"),
    );
    expect(curves.length).toBeGreaterThan(0);
  });

  it("marks the selected commit distinctly", () => {
    const { rows, state } = layout(linear(5));

    const { container } = render(
      <GraphCanvas
        rows={rows}
        window={{ startIndex: 0, endIndex: 4, totalHeight: 5 * ROW_HEIGHT }}
        maxLanes={state.maxLanes}
        selectedId="c2"
      />,
    );

    expect(
      container.querySelectorAll(".graph-canvas__node--selected"),
    ).toHaveLength(1);
  });

  it("stays out of the accessibility tree; the table carries the semantics", () => {
    const { rows, state } = layout(linear(3));

    const { container } = render(
      <GraphCanvas
        rows={rows}
        window={{ startIndex: 0, endIndex: 2, totalHeight: 3 * ROW_HEIGHT }}
        maxLanes={state.maxLanes}
        selectedId={null}
      />,
    );

    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
  });
});
