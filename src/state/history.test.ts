import { describe, expect, it } from "vitest";

import { layout } from "../lib/graph-layout/layout";
import type { GraphCommit } from "../lib/graph-layout/types";

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
