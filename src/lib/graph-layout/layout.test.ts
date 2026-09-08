import { describe, expect, it } from "vitest";
import { layout } from "./layout";
import type { GraphCommit } from "./types";

const commit = (id: string, ...parents: string[]): GraphCommit => ({
  id,
  parents,
});

const merged = [
  commit("merge", "main", "side"),
  commit("side", "root"),
  commit("main", "root"),
  commit("root"),
];

describe("resumable lane layout", () => {
  it("keeps linear histories in lane zero and terminates the root", () => {
    const result = layout([commit("b", "a"), commit("a")]);
    expect(result.rows).toEqual([
      {
        id: "b",
        index: 0,
        lane: 0,
        incoming: [],
        outgoing: [{ from: 0, to: 0, colorLane: 0 }],
      },
      { id: "a", index: 1, lane: 0, incoming: [0], outgoing: [] },
    ]);
    expect(result.state).toEqual({ lanes: [], rowCount: 2, maxLanes: 1 });
  });

  it("resolves merges using exact lane positions and edge colors", () => {
    const result = layout(merged);
    expect(result.rows.map((row) => row.lane)).toEqual([0, 1, 0, 1]);
    expect(result.rows.map((row) => row.outgoing)).toEqual([
      [
        { from: 0, to: 0, colorLane: 0 },
        { from: 0, to: 1, colorLane: 1 },
      ],
      [
        { from: 0, to: 0, colorLane: 0 },
        { from: 1, to: 1, colorLane: 1 },
      ],
      [
        { from: 1, to: 1, colorLane: 1 },
        { from: 0, to: 1, colorLane: 1 },
      ],
      [],
    ]);
  });

  it("preserves the first page byte-for-byte and matches a single traversal", () => {
    const first = layout(merged.slice(0, 2));
    const before = JSON.stringify(first);
    const second = layout(merged.slice(2), first.state);
    expect(JSON.stringify(first)).toBe(before);
    expect([...first.rows, ...second.rows]).toEqual(layout(merged).rows);
    expect(second.state).toEqual(layout(merged).state);
    expect(first.state.lanes).toEqual(["main", "root"]);
  });

  it("matches the whole history at every possible page boundary", () => {
    for (let index = 0; index <= merged.length; index += 1) {
      const first = layout(merged.slice(0, index));
      const second = layout(merged.slice(index), first.state);
      expect([...first.rows, ...second.rows]).toEqual(layout(merged).rows);
    }
  });

  it("reserves all octopus parents and reuses an already promised parent", () => {
    const result = layout([
      commit("octopus", "a", "b", "c"),
      commit("c", "root"),
      commit("b", "root"),
      commit("a", "root"),
      commit("root"),
    ]);
    expect(result.rows.map((row) => row.lane)).toEqual([0, 2, 1, 0, 2]);
    expect(result.rows[0]?.outgoing).toEqual([
      { from: 0, to: 0, colorLane: 0 },
      { from: 0, to: 1, colorLane: 1 },
      { from: 0, to: 2, colorLane: 2 },
    ]);
    expect(result.state.maxLanes).toBe(3);
  });

  it("keeps a first parent on its current lane even when lower slots are free", () => {
    const result = layout([
      commit("one", "a"),
      commit("two", "b"),
      commit("a"),
      commit("b", "c"),
      commit("c"),
    ]);
    expect(result.rows.map((row) => row.lane)).toEqual([0, 1, 0, 1, 1]);
    expect(result.state.lanes).toEqual([]);
  });

  it("reuses free lanes and handles multiple roots without growing forever", () => {
    const result = layout([
      commit("one", "a"),
      commit("two", "b"),
      commit("a"),
      commit("new", "c"),
      commit("c"),
      commit("b"),
    ]);
    expect(result.rows.map((row) => row.lane)).toEqual([0, 1, 0, 0, 0, 1]);
    expect(result.state.maxLanes).toBe(2);
  });

  it("deduplicates duplicate parent edges and preserves empty continuations", () => {
    const result = layout([commit("a", "b", "b")]);
    expect(result.rows[0]?.outgoing).toHaveLength(1);
    expect(layout([], result.state).state).toEqual(result.state);
    expect(layout([])).toEqual({
      rows: [],
      state: { lanes: [], rowCount: 0, maxLanes: 0 },
    });
  });

  it("rejects malformed page order instead of producing corrupt geometry", () => {
    for (const commits of [
      [commit("")],
      [commit("a"), commit("a")],
      [commit("a", "a")],
      [commit("a"), commit("b", "a")],
      [commit("a", "")],
    ])
      expect(() => layout(commits)).toThrow();
    expect(() =>
      layout([], { lanes: ["a", "a"], rowCount: 0, maxLanes: 2 }),
    ).toThrow("Duplicate lane reservation");
  });
});
