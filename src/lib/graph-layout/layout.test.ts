import { describe, expect, it } from "vitest";
import { layout } from "./layout";
import type { GraphCommit } from "./types";
import type { GraphContext } from "./context";

const commit = (id: string, ...parents: string[]): GraphCommit => ({
  id,
  parents,
});
const merged = [
  commit("m", "a", "b"),
  commit("a", "base"),
  commit("b", "base"),
  commit("base"),
];
const context: GraphContext = {
  principal: "main",
  seeds: [
    { id: "main", commitId: "m" },
    { id: "side", commitId: "b" },
  ],
};

describe("semantic incremental graph", () => {
  it("keeps the principal left and the side branch distinct through its join", () => {
    const { rows } = layout(merged, undefined, context);
    expect(rows.map((row) => row.lane)).toEqual([0, 0, 1, 0]);
    expect(rows.map((row) => row.trajectory)).toEqual([
      "main",
      "main",
      "side",
      "main",
    ]);
    expect(rows[2]?.outgoing).toHaveLength(2);
    expect(rows[3]?.incoming).toEqual([
      { from: 0, to: 0, trajectory: "main" },
      { from: 1, to: 0, trajectory: "side" },
    ]);
  });
  it("produces identical geometry for every pagination boundary without mutating earlier rows", () => {
    const whole = layout(merged, undefined, context);
    for (let split = 0; split <= merged.length; split += 1) {
      const first = layout(merged.slice(0, split), undefined, context);
      const before = JSON.stringify(first);
      const next = layout(merged.slice(split), first.state, context);
      expect([...first.rows, ...next.rows]).toEqual(whole.rows);
      expect(next.state).toEqual(whole.state);
      expect(JSON.stringify(first)).toBe(before);
    }
  });
  it("reserves an empty left lane for a principal whose tip arrives later", () => {
    const ctx = {
      principal: "main",
      seeds: [
        { id: "side", commitId: "side" },
        { id: "main", commitId: "main" },
      ],
    };
    const first = layout([commit("side", "base")], undefined, ctx);
    expect(first.rows[0]?.lane).toBe(1);
    expect(first.rows[0]?.incoming).toEqual([]);
    expect(first.rows[0]?.outgoing.some((edge) => edge.to === 0)).toBe(false);
    const next = layout(
      [commit("main", "base"), commit("base")],
      first.state,
      ctx,
    );
    expect(next.rows.map((row) => row.lane)).toEqual([0, 0]);
  });
  it("retains every octopus edge and emits a single node at the common root", () => {
    const commits = [
      commit("merge", "a", "b", "c"),
      commit("a", "root"),
      commit("b", "root"),
      commit("c", "root"),
      commit("root"),
    ];
    const result = layout(commits);
    expect(result.rows[0]?.outgoing).toHaveLength(3);
    expect(result.rows[4]?.incoming).toHaveLength(3);
    expect(result.rows[4]?.outgoing).toEqual([]);
    expect(new Set(result.rows.map((row) => row.id)).size).toBe(5);
  });
  it("deduplicates parent edges, reuses finished lanes and supports empty histories", () => {
    expect(layout([]).state).toEqual({ lanes: [], rowCount: 0, maxLanes: 0 });
    const result = layout([commit("a", "b", "b"), commit("b"), commit("c")]);
    expect(result.rows[0]?.outgoing).toHaveLength(1);
    expect(result.state.maxLanes).toBe(1);
  });
  it("rejects invalid topological input", () => {
    for (const commits of [
      [commit("")],
      [commit("a"), commit("a")],
      [commit("a", "a")],
      [commit("a"), commit("b", "a")],
      [commit("a", "")],
    ])
      expect(() => layout(commits)).toThrow();
  });
});

it("handles repeated merges into a future named tip without joining early", () => {
  const commits = [
    commit("x", "y", "p"),
    commit("y", "z", "p"),
    commit("z", "root"),
    commit("p", "root"),
    commit("root"),
  ];
  const ctx = {
    principal: "main",
    seeds: [
      { id: "other", commitId: "x" },
      { id: "main", commitId: "p" },
    ],
  };
  const result = layout(commits, undefined, ctx);
  expect(
    result.rows
      .find((row) => row.id === "p")
      ?.incoming.filter((edge) => edge.trajectory === "main"),
  ).toHaveLength(2);
  for (let split = 0; split < commits.length; split += 1) {
    const first = layout(commits.slice(0, split), undefined, ctx);
    const next = layout(commits.slice(split), first.state, ctx);
    expect([...first.rows, ...next.rows]).toEqual(result.rows);
  }
});

it("preserves topology and pagination across deterministic generated DAGs", () => {
  for (let seed = 1; seed <= 30; seed += 1) {
    const commits = Array.from({ length: 90 }, (_, index) => {
      const parents = index < 89 ? [`c${String(index + 1)}`] : [];
      if (index + 5 < 90 && (index * seed) % 7 === 0)
        parents.push(`c${String(index + 5)}`);
      return { id: `c${String(index)}`, parents };
    });
    const ctx = {
      principal: "main",
      seeds: [
        { id: "other", commitId: "c0" },
        { id: "main", commitId: "c7" },
      ],
    };
    const whole = layout(commits, undefined, ctx);
    const first = layout(commits.slice(0, 45), undefined, ctx);
    const next = layout(commits.slice(45), first.state, ctx);
    expect([...first.rows, ...next.rows]).toEqual(whole.rows);
    expect(whole.rows).toHaveLength(commits.length);
  }
});
