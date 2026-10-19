import { describe, expect, it } from "vitest";

import { ROW_HEIGHT, laneCenterX, rowCenterY } from "../../lib/historyGeometry";

import { layout } from "../../lib/graph-layout/layout";

import { connectionSegments, edgePath, incomingPath } from "./path";

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

describe("adjacent merge routing", () => {
  const context = {
    principal: "main",
    seeds: [
      { id: "dev", commitId: "dev-tip" },
      { id: "main", commitId: "merge" },
    ],
  };
  const commits: readonly { id: string; parents: string[] }[] = [
    { id: "dev-tip", parents: ["release"] },
    { id: "merge", parents: ["base", "release"] },
    { id: "release", parents: ["base"] },
    { id: "base", parents: [] },
  ];

  it("connects the merge straight to the next commit's existing lane", () => {
    const { rows } = layout(commits, undefined, context);
    const merge = rows[1];
    const release = rows[2];
    if (merge === undefined || release === undefined)
      throw new Error("Missing fixture");
    expect(merge.outgoing.some((edge) => edge.to === 2)).toBe(true);
    const outgoing = connectionSegments(merge, rows[0], release).at(-1);
    const incoming = connectionSegments(release, merge, rows[3]).find(
      (segment) => segment.trajectory === outgoing?.trajectory,
    );
    expect(points(outgoing?.path ?? "")[0]).toEqual([
      laneCenterX(0),
      rowCenterY(1),
    ]);
    expect(points(incoming?.path ?? "").at(-1)).toEqual([
      laneCenterX(1),
      rowCenterY(2),
    ]);
    // The boundary is between the endpoint lanes, so it cannot overshoot or
    // join the existing vertical branch before reaching the destination node.
    expect(points(outgoing?.path ?? "").at(-1)?.[0]).toBe(
      (laneCenterX(0) + laneCenterX(1)) / 2,
    );
    expect(
      points(outgoing?.path ?? "").every(
        ([x]) => x >= laneCenterX(0) && x <= laneCenterX(1),
      ),
    ).toBe(true);
    expect(points(outgoing?.path ?? "").at(-1)).toEqual(
      points(incoming?.path ?? "")[0],
    );
  });

  it("keeps distant parents on independent paths until the destination node", () => {
    const { rows } = layout(
      [
        ...commits.slice(0, 2),
        { id: "intervening", parents: [] },
        ...commits.slice(2),
      ],
      undefined,
      context,
    );
    const merge = rows[1];
    const intervening = rows[2];
    if (merge === undefined || intervening === undefined)
      throw new Error("Missing fixture");
    expect(connectionSegments(merge, rows[0], intervening).at(-1)?.path).toBe(
      edgePath(1, 0, 2),
    );
    expect(
      connectionSegments(intervening, merge, rows[3]).filter(
        (segment) => segment.path === incomingPath(2, 2),
      ),
    ).toHaveLength(1);
  });

  it("waits for the next page without changing the layout or losing frontier identity", () => {
    const first = layout(commits.slice(0, 2), undefined, context);
    const before = JSON.stringify(first);
    const second = layout(commits.slice(2), first.state, context);
    const whole = layout(commits, undefined, context);
    const rows = [...first.rows, ...second.rows];
    expect(rows).toEqual(whole.rows);
    expect(JSON.stringify(first)).toBe(before);
    expect(
      rows.flatMap((row, index) =>
        connectionSegments(row, rows[index - 1], rows[index + 1]),
      ),
    ).toEqual(
      whole.rows.flatMap((row, index) =>
        connectionSegments(row, whole.rows[index - 1], whole.rows[index + 1]),
      ),
    );
  });

  it("renders the unfinished frontier without guessing its destination lane", () => {
    const { rows } = layout(commits.slice(0, 2), undefined, context);
    const merge = rows[1];
    if (merge === undefined) throw new Error("Missing fixture");
    expect(connectionSegments(merge, rows[0], undefined).at(-1)?.path).toBe(
      edgePath(1, 0, 2),
    );
  });
});

it("retains the compact curve for an adjacent join without a detour", () => {
  const result = layout(
    [
      { id: "merge", parents: ["a", "b"] },
      { id: "a", parents: ["base"] },
      { id: "b", parents: ["base"] },
      { id: "base", parents: [] },
    ],
    undefined,
    { principal: "main", seeds: [{ id: "main", commitId: "merge" }] },
  );
  const row = result.rows[2];
  if (row === undefined) throw new Error("Missing fixture");
  const outgoing = connectionSegments(row, result.rows[1], result.rows[3]).at(
    -1,
  );
  const coords = points(outgoing?.path ?? "");
  expect(coords[0]?.[0]).toBe(laneCenterX(1));
  expect(coords.at(-1)?.[0]).toBe(laneCenterX(1));
  const destination = result.rows[3];
  if (destination === undefined) throw new Error("Missing fixture");
  expect(connectionSegments(destination, row, undefined).at(-1)?.path).toBe(
    incomingPath(3, 1, 0),
  );
  expect(
    coords.every(([x], index) => x <= (coords[index - 1]?.[0] ?? Infinity)),
  ).toBe(true);
});

it("gives all three branches the same compact join at their shared base", () => {
  const { rows } = layout(
    [
      { id: "pink", parents: ["base"] },
      { id: "blue", parents: ["base"] },
      { id: "violet", parents: ["base"] },
      { id: "base", parents: [] },
    ],
    undefined,
    {
      principal: "main",
      seeds: [
        { id: "pink", commitId: "pink" },
        { id: "blue", commitId: "blue" },
        { id: "violet", commitId: "violet" },
        { id: "main", commitId: "base" },
      ],
    },
  );
  const base = rows[3];
  if (base === undefined) throw new Error("Missing fixture");
  const joins = connectionSegments(base, rows[2], undefined);
  expect(joins.map((segment) => segment.path)).toEqual([
    incomingPath(3, 1, 0),
    incomingPath(3, 2, 0),
    incomingPath(3, 3, 0),
  ]);
  for (const row of rows.slice(0, 3)) {
    expect(
      connectionSegments(row, rows[row.index - 1], rows[row.index + 1]).at(-1)
        ?.path,
    ).toBe(edgePath(row.index, row.lane, row.lane));
  }
});
