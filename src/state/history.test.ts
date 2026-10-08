import { describe, expect, it } from "vitest";

import type { CommitInfo, HistoryPage } from "../bindings";
import { layout } from "../lib/graph-layout/layout";
import type { GraphCommit } from "../lib/graph-layout/types";

import { layoutHistory } from "./history";

/**
 * The invariant the whole pagination design rests on.
 *
 * `useHistory` resumes the layout from the previous page's state instead of
 * recomputing it. These assert what that buys, without needing React: page one
 * must lay out identically whether or not page two ever arrives.
 */
describe("incremental history layout", () => {
  function chain(from: number, to: number): GraphCommit[] {
    return Array.from({ length: to - from }, (_, offset) => {
      const index = from + offset;
      return {
        id: `c${String(index)}`,
        parents: index + 1 < to || to < 40 ? [`c${String(index + 1)}`] : [],
      };
    });
  }

  it("does not move a row when the next page arrives", () => {
    const first = layout(chain(0, 20));
    const second = layout(chain(20, 40), first.state);

    const rerun = layout(chain(0, 20));
    expect(rerun.rows).toEqual(first.rows);

    // Continuation rows carry on from where the first page stopped.
    expect(second.rows[0]?.index).toBe(20);
  });

  it("produces the same rows page by page as it would in one pass", () => {
    const whole = layout(chain(0, 40));

    const first = layout(chain(0, 20));
    const second = layout(chain(20, 40), first.state);
    const paged = [...first.rows, ...second.rows];

    expect(paged).toEqual(whole.rows);
  });

  it("keeps lane assignment stable across a merge that spans pages", () => {
    const page1: GraphCommit[] = [
      { id: "m", parents: ["a", "b"] },
      { id: "a", parents: ["base"] },
    ];
    const page2: GraphCommit[] = [
      { id: "b", parents: ["base"] },
      { id: "base", parents: [] },
    ];

    const first = layout(page1);
    const second = layout(page2, first.state);

    // `b` was reserved on page one and must land in that exact lane.
    const reservedLane = first.state.lanes.indexOf("b");
    expect(reservedLane).toBeGreaterThanOrEqual(0);
    expect(second.rows[0]?.lane).toBe(reservedLane);
  });
});

describe("layoutHistory", () => {
  function commit(id: string, parents: string[]): CommitInfo {
    return {
      id,
      parents,
      summary: id,
      message: id,
      author_name: "A",
      author_email: "a@example.com",
      author_time: "0",
      commit_time: "0",
    };
  }

  function page(commits: CommitInfo[], next: string | null): HistoryPage {
    return { commits, next_cursor: next, roots: [] };
  }

  const first = () =>
    page([commit("m", ["a", "b"]), commit("a", ["base"])], "a");
  const second = () => page([commit("b", ["base"]), commit("base", [])], null);

  function whole(pages: HistoryPage[]) {
    return layout(
      pages.flatMap((p) =>
        p.commits.map((c) => ({ id: c.id, parents: c.parents })),
      ),
    );
  }

  it("matches laying the whole history out in one pass", () => {
    const pages = [first(), second()];
    const result = layoutHistory(pages);
    expect(result.rows).toEqual(whole(pages).rows);
    expect(result.commits.map((c) => c.id)).toEqual(["m", "a", "b", "base"]);
    expect(result.maxLanes).toBe(whole(pages).state.maxLanes);
  });

  it("keeps the rows of pages it already laid out when a page is appended", () => {
    const one = first();
    const before = layoutHistory([one]);
    const after = layoutHistory([one, second()], before);

    expect(after.rows.slice(0, 2)).toEqual(before.rows);
    expect(after.rows[0]).toBe(before.rows[0]);
    expect(after.rows).toEqual(whole([one, second()]).rows);
  });

  it("returns the previous result untouched when nothing changed", () => {
    const pages = [first(), second()];
    const before = layoutHistory(pages);
    expect(layoutHistory([...pages], before)).toBe(before);
  });

  it("lays out again from the first page that differs", () => {
    const one = first();
    const before = layoutHistory([one, second()]);
    // A refetch after a change replaces the later page but reuses the first.
    const changed = page([commit("b", []), commit("z", [])], null);
    const after = layoutHistory([one, changed], before);

    expect(after.rows[0]).toBe(before.rows[0]);
    expect(after.rows).toEqual(whole([one, changed]).rows);
    expect(after.commits.map((c) => c.id)).toEqual(["m", "a", "b", "z"]);
  });

  it("does not mutate the previous result", () => {
    const one = first();
    const before = layoutHistory([one]);
    const snapshot = structuredClone(before.rows);
    layoutHistory([one, second()], before);
    expect(before.rows).toEqual(snapshot);
    expect(before.commits).toHaveLength(2);
  });
});
