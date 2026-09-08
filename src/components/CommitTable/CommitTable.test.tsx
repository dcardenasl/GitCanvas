// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CommitInfo } from "../../bindings";

import { CommitTable } from "./CommitTable";
import { ROW_HEIGHT, graphWidth } from "./geometry";

afterEach(cleanup);

function makeCommits(count: number): CommitInfo[] {
  return Array.from({ length: count }, (_, index) => ({
    id: String(index).padStart(40, "0"),
    parents: index + 1 < count ? [String(index + 1).padStart(40, "0")] : [],
    summary: `commit ${String(index)}`,
    message: `commit ${String(index)}`,
    author_name: "David Cardenas",
    author_email: "david@example.com",
    author_time: "1788815520",
    commit_time: "1788815520",
  }));
}

/**
 * jsdom reports every element as zero-sized, so the virtualizer would mount a
 * single row and the point of the test would be lost. This gives the scroll
 * container a real viewport.
 */
function withViewport(height: number): void {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    width: 800,
    height,
    top: 0,
    left: 0,
    bottom: height,
    right: 800,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
}

describe("CommitTable", () => {
  it("mounts only the visible rows plus overscan, not the whole history", () => {
    withViewport(ROW_HEIGHT * 10);
    const commits = makeCommits(5000);

    render(
      <CommitTable
        commits={commits}
        selectedId={null}
        onSelect={() => undefined}
        maxLanes={1}
      />,
    );

    const rows = screen.getAllByRole("option");
    // Ten visible rows plus two overscan margins; the exact count depends on
    // the virtualizer, but it must be nowhere near five thousand.
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThan(100);
  });

  it("reports the commit that was clicked", async () => {
    withViewport(ROW_HEIGHT * 10);
    const onSelect = vi.fn();
    const commits = makeCommits(20);

    render(
      <CommitTable
        commits={commits}
        selectedId={null}
        onSelect={onSelect}
        maxLanes={1}
      />,
    );

    await userEvent.click(screen.getByText("commit 3"));

    expect(onSelect).toHaveBeenCalledWith(commits[3]?.id);
  });

  it("moves the selection with the arrow keys", async () => {
    withViewport(ROW_HEIGHT * 10);
    const onSelect = vi.fn();
    const commits = makeCommits(20);

    render(
      <CommitTable
        commits={commits}
        selectedId={commits[2]?.id ?? null}
        onSelect={onSelect}
        maxLanes={1}
      />,
    );

    const selected = screen.getByRole("option", { selected: true });
    selected.focus();
    await userEvent.keyboard("{ArrowDown}");

    expect(onSelect).toHaveBeenCalledWith(commits[3]?.id);
  });

  it("asks for the next page when the tail comes into view", () => {
    withViewport(ROW_HEIGHT * 10);
    const onReachEnd = vi.fn();

    render(
      <CommitTable
        commits={makeCommits(5)}
        selectedId={null}
        onSelect={() => undefined}
        maxLanes={1}
        onReachEnd={onReachEnd}
      />,
    );

    // The whole history fits on screen, so the tail is already visible.
    return vi.waitFor(() => {
      expect(onReachEnd).toHaveBeenCalled();
    });
  });

  it("offsets the rows past the graph column instead of padding the list", () => {
    // Rows are absolutely positioned, and an absolutely positioned box resolves
    // `left` against the padding box — so padding on the list is ignored and the
    // graph ends up drawn through the commit messages. This shipped once.
    withViewport(ROW_HEIGHT * 10);

    const { container } = render(
      <CommitTable
        commits={makeCommits(5)}
        selectedId={null}
        onSelect={() => undefined}
        maxLanes={4}
      />,
    );

    const list = container.querySelector<HTMLElement>(".commit-table__rows");
    const expected = `${String(graphWidth(4))}px`;

    expect(list?.style.getPropertyValue("--graph-width")).toBe(expected);
    expect(list?.style.paddingLeft).toBe("");
  });

  it("hands the graph layer the row window it should draw", () => {
    withViewport(ROW_HEIGHT * 10);
    const renderGraph = vi.fn().mockReturnValue(null);

    render(
      <CommitTable
        commits={makeCommits(200)}
        selectedId={null}
        onSelect={() => undefined}
        maxLanes={3}
        renderGraph={renderGraph}
      />,
    );

    expect(renderGraph).toHaveBeenCalled();
    const window = renderGraph.mock.calls[0]?.[0] as {
      startIndex: number;
      endIndex: number;
      totalHeight: number;
    };
    expect(window.startIndex).toBe(0);
    expect(window.endIndex).toBeLessThan(200);
    expect(window.totalHeight).toBe(200 * ROW_HEIGHT);
  });
});
