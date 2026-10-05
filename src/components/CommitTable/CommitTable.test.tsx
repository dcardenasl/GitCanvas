// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get: () => height,
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
    expect(document.activeElement).toBe(
      screen.getByRole("option", { name: /^commit 3\./ }),
    );
  });

  it("can be reached with Tab when no commit is selected", async () => {
    withViewport(ROW_HEIGHT * 10);
    render(
      <CommitTable
        commits={makeCommits(5)}
        selectedId={null}
        onSelect={() => undefined}
        maxLanes={1}
      />,
    );

    await userEvent.tab();

    expect(document.activeElement).toBe(screen.getAllByRole("option")[0]);
  });

  it.each([
    ["Home", 0],
    ["End", 19],
    ["PageDown", 12],
    ["PageUp", 0],
  ])("moves selection with %s", async (key, targetIndex) => {
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

    screen.getByRole("option", { selected: true }).focus();
    await userEvent.keyboard(`{${key}}`);

    expect(onSelect).toHaveBeenCalledWith(commits[targetIndex]?.id);
  });

  it("opens the commit menu from the keyboard", async () => {
    withViewport(ROW_HEIGHT * 10);
    render(
      <CommitTable
        commits={makeCommits(3)}
        selectedId={null}
        onSelect={() => undefined}
        maxLanes={1}
      />,
    );

    screen.getAllByRole("option")[0]?.focus();
    await userEvent.keyboard("{Shift>}{F10}{/Shift}");

    expect(await screen.findByRole("menu")).toBeDefined();
    expect(document.activeElement).toBe(
      screen.getByRole("menuitem", { name: "Copiar hash (0000000)" }),
    );
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

  it("asks once per arrival, not once per render", () => {
    withViewport(ROW_HEIGHT * 10);
    const onReachEnd = vi.fn();
    const props = {
      selectedId: null,
      onSelect: () => undefined,
      maxLanes: 1,
      onReachEnd,
    };
    const first = makeCommits(5);

    const { rerender } = render(<CommitTable commits={first} {...props} />);
    expect(onReachEnd).toHaveBeenCalledTimes(1);

    // Rendering again with the same rows must not repeat the request.
    rerender(<CommitTable commits={first} {...props} />);
    rerender(<CommitTable commits={first} {...props} />);
    expect(onReachEnd).toHaveBeenCalledTimes(1);

    // A new page arriving while the tail is still in view asks for the next.
    rerender(<CommitTable commits={makeCommits(8)} {...props} />);
    expect(onReachEnd).toHaveBeenCalledTimes(2);
  });

  it("does not ask while the tail is far below the viewport", () => {
    withViewport(ROW_HEIGHT * 10);
    const onReachEnd = vi.fn();

    render(
      <CommitTable
        commits={makeCommits(5000)}
        selectedId={null}
        onSelect={() => undefined}
        maxLanes={1}
        onReachEnd={onReachEnd}
      />,
    );

    expect(onReachEnd).not.toHaveBeenCalled();
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

  it("names each row for a listener instead of running fields together", () => {
    // The DOM concatenates to "…2e53be608-sept, 04:56 p.m.", reading the hash
    // straight into the date.
    withViewport(ROW_HEIGHT * 10);
    render(
      <CommitTable
        commits={makeCommits(3)}
        selectedId={null}
        onSelect={() => undefined}
        maxLanes={1}
      />,
    );

    const label = screen.getAllByRole("option")[0]?.getAttribute("aria-label");
    expect(label).toContain("commit 0. por David Cardenas");
    expect(label).toMatch(/commit [0-9a-f]{7}$/);
  });

  it("offers copying the commit from a context menu", async () => {
    withViewport(ROW_HEIGHT * 10);
    const commits = makeCommits(3);
    render(
      <CommitTable
        commits={commits}
        selectedId={null}
        onSelect={() => undefined}
        maxLanes={1}
      />,
    );

    const row = screen.getAllByRole("option")[0];
    if (row === undefined) throw new Error("no rows rendered");
    fireEvent.contextMenu(row);

    expect(await screen.findByRole("menu")).toBeDefined();
    expect(
      screen.getByRole("menuitem", { name: /Copiar hash completo/ }),
    ).toBeDefined();
    expect(
      screen.getByRole("menuitem", { name: "Copiar mensaje" }),
    ).toBeDefined();
  });

  it("selects the row the context menu was opened on", () => {
    withViewport(ROW_HEIGHT * 10);
    const onSelect = vi.fn();
    const commits = makeCommits(3);
    render(
      <CommitTable
        commits={commits}
        selectedId={null}
        onSelect={onSelect}
        maxLanes={1}
      />,
    );

    const row = screen.getAllByRole("option")[1];
    if (row === undefined) throw new Error("no rows rendered");
    fireEvent.contextMenu(row);

    // Acting on a menu for a row you did not select is how the wrong hash ends
    // up on the clipboard.
    expect(onSelect).toHaveBeenCalledWith(commits[1]?.id);
  });

  it("scrolls to a commit it is asked to reveal", () => {
    withViewport(ROW_HEIGHT * 10);
    const commits = makeCommits(500);
    const onRevealed = vi.fn();
    const target = commits[300]?.id ?? "";

    render(
      <CommitTable
        commits={commits}
        selectedId={target}
        onSelect={() => undefined}
        maxLanes={1}
        revealCommitId={target}
        onRevealed={onRevealed}
      />,
    );

    // Reporting back is what lets the caller clear the request; without it the
    // history would scroll again on every render.
    expect(onRevealed).toHaveBeenCalledTimes(1);
  });

  it("waits rather than failing when the commit is not loaded yet", () => {
    withViewport(ROW_HEIGHT * 10);
    const onRevealed = vi.fn();

    render(
      <CommitTable
        commits={makeCommits(10)}
        selectedId={null}
        onSelect={() => undefined}
        maxLanes={1}
        revealCommitId="a-commit-on-a-later-page"
        onRevealed={onRevealed}
      />,
    );

    // Doing nothing is what makes the caller safe to keep fetching pages and
    // re-rendering until the commit turns up.
    expect(onRevealed).not.toHaveBeenCalled();
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
