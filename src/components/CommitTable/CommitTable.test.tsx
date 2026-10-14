// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CommitInfo } from "../../bindings";

import { CommitTable } from "./CommitTable";
import { ROW_HEIGHT, graphWidth } from "../../lib/historyGeometry";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  Reflect.deleteProperty(HTMLElement.prototype, "scrollTo");
  Reflect.deleteProperty(HTMLElement.prototype, "scrollHeight");
});

/**
 * jsdom has no `scrollTo` and lays nothing out, so a scroll can never go far
 * enough to be seen. This records where the virtualizer asks to go, and gives
 * the container the height `rows` rows would have, which is what bounds it.
 */
function recordScrolling(rows = 500) {
  const scrollTo = vi.fn();
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value: scrollTo,
  });
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get: () => rows * ROW_HEIGHT,
  });
  return scrollTo;
}

/** The offsets the table scrolled to, in rows. */
function scrolledToRows(
  scrollTo: ReturnType<typeof recordScrolling>,
): number[] {
  return scrollTo.mock.calls.map(
    ([options]) => (options as { top: number }).top / ROW_HEIGHT,
  );
}

function scrollContainer(): HTMLElement {
  const element = document.querySelector<HTMLElement>(".commit-table");
  if (element === null) throw new Error("the table did not render");
  return element;
}

function scrollTo(rows: number): void {
  const element = scrollContainer();
  element.scrollTop = rows * ROW_HEIGHT;
  fireEvent.scroll(element);
}

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

    expect(await screen.findByRole("menu")).toBeInstanceOf(HTMLElement);
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

    render(
      <CommitTable
        commits={makeCommits(5)}
        selectedId={null}
        onSelect={() => undefined}
        maxLanes={4}
      />,
    );

    const list = screen.getByRole("listbox", { name: "Historial de commits" });
    const expected = `${String(graphWidth(4))}px`;

    expect(list.style.getPropertyValue("--graph-width")).toBe(expected);
    expect(list.style.paddingLeft).toBe("");
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

    expect(await screen.findByRole("menu")).toBeInstanceOf(HTMLElement);
    expect(
      screen.getByRole("menuitem", { name: /Copiar hash completo/ }),
    ).toBeInstanceOf(HTMLElement);
    expect(
      screen.getByRole("menuitem", { name: "Copiar mensaje" }),
    ).toBeInstanceOf(HTMLElement);
  });

  it("copies the selected commit hash and announces success", async () => {
    withViewport(ROW_HEIGHT * 10);
    const commits = makeCommits(3);
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
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
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Copiar hash completo" }),
    );

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toBe(
        "hash completo copiado",
      );
    });
    expect(writeText).toHaveBeenCalledWith(commits[0]?.id);
  });

  it("announces when the browser refuses to copy a commit hash", async () => {
    withViewport(ROW_HEIGHT * 10);
    const commits = makeCommits(3);
    const writeText = vi.fn().mockRejectedValue(new Error("clipboard denied"));
    vi.stubGlobal("navigator", { clipboard: { writeText } });
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
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Copiar hash completo" }),
    );

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toBe(
        "no se pudo copiar el hash completo",
      );
    });
    expect(writeText).toHaveBeenCalledWith(commits[0]?.id);
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

  it("marks the author's name apart from the initials, so a narrow table can drop only the name", () => {
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

    const author = document.querySelector(".commit-row__author");
    expect(author?.querySelector(".commit-row__avatar")?.textContent).toBe(
      "DC",
    );
    expect(author?.querySelector(".commit-row__author-name")?.textContent).toBe(
      "David Cardenas",
    );
  });

  describe("remembering where the history was", () => {
    function renderTable(
      props: Partial<Parameters<typeof CommitTable>[0]> = {},
    ) {
      const commits = props.commits ?? makeCommits(500);
      return render(
        <CommitTable
          commits={commits}
          selectedId={null}
          onSelect={() => undefined}
          maxLanes={1}
          {...props}
        />,
      );
    }

    it("returns to the commit it was left on when that commit is loaded", () => {
      withViewport(ROW_HEIGHT * 10);
      const scrolling = recordScrolling();
      const commits = makeCommits(500);

      renderTable({ commits, anchorCommitId: commits[300]?.id ?? null });

      expect(scrolledToRows(scrolling)).toContain(300);
    });

    it("starts at the top when the anchor is not among the loaded commits", () => {
      withViewport(ROW_HEIGHT * 10);
      const scrolling = recordScrolling();

      renderTable({ anchorCommitId: "f".repeat(40) });

      // The virtualizer's own initial placement at the top is not a restore.
      expect(scrolledToRows(scrolling).filter((row) => row !== 0)).toEqual([]);
    });

    it("lets a pending reveal choose where to go instead", () => {
      withViewport(ROW_HEIGHT * 10);
      const scrolling = recordScrolling();
      const commits = makeCommits(500);

      renderTable({
        commits,
        anchorCommitId: commits[300]?.id ?? null,
        revealCommitId: commits[10]?.id ?? null,
        onRevealed: () => undefined,
      });

      const rows = scrolledToRows(scrolling);
      expect(rows).not.toContain(300);
    });

    it("restores once, not again when the anchor later changes", () => {
      withViewport(ROW_HEIGHT * 10);
      const scrolling = recordScrolling();
      const commits = makeCommits(500);
      const { rerender } = renderTable({
        commits,
        anchorCommitId: commits[300]?.id ?? null,
      });
      const calls = scrolling.mock.calls.length;

      rerender(
        <CommitTable
          commits={commits}
          selectedId={null}
          onSelect={() => undefined}
          maxLanes={1}
          anchorCommitId={commits[50]?.id ?? null}
        />,
      );

      expect(scrolling.mock.calls.length).toBe(calls);
    });

    it("waits for the first rows, then tries once", () => {
      withViewport(ROW_HEIGHT * 10);
      const scrolling = recordScrolling();
      const commits = makeCommits(500);
      const anchor = commits[300]?.id ?? null;
      const { rerender } = renderTable({ commits: [], anchorCommitId: anchor });
      expect(scrolledToRows(scrolling).filter((row) => row !== 0)).toEqual([]);

      rerender(
        <CommitTable
          commits={commits}
          selectedId={null}
          onSelect={() => undefined}
          maxLanes={1}
          anchorCommitId={anchor}
        />,
      );

      expect(scrolledToRows(scrolling)).toContain(300);
    });

    it("reports the commit at the top once scrolling settles", () => {
      withViewport(ROW_HEIGHT * 10);
      vi.useFakeTimers();
      const commits = makeCommits(500);
      const onAnchorChange = vi.fn();
      renderTable({ commits, onAnchorChange });

      scrollTo(20);
      scrollTo(40);
      expect(onAnchorChange).not.toHaveBeenCalled();
      vi.advanceTimersByTime(149);
      expect(onAnchorChange).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);

      // One report, for where the scrolling ended.
      expect(onAnchorChange).toHaveBeenCalledTimes(1);
      expect(onAnchorChange).toHaveBeenCalledWith(commits[40]?.id);
    });

    it("never names a commit past the end of what is loaded", () => {
      withViewport(ROW_HEIGHT * 10);
      vi.useFakeTimers();
      const commits = makeCommits(20);
      const onAnchorChange = vi.fn();
      renderTable({ commits, onAnchorChange });

      scrollTo(900);
      vi.advanceTimersByTime(150);

      expect(onAnchorChange).toHaveBeenCalledWith(commits[19]?.id);
    });

    it("reports a move that was still settling when the table is replaced", () => {
      withViewport(ROW_HEIGHT * 10);
      vi.useFakeTimers();
      const commits = makeCommits(500);
      const onAnchorChange = vi.fn();
      const { unmount } = renderTable({ commits, onAnchorChange });
      scrollTo(30);

      unmount();

      expect(onAnchorChange).toHaveBeenCalledWith(commits[30]?.id);
      vi.advanceTimersByTime(1000);
      expect(onAnchorChange).toHaveBeenCalledTimes(1);
    });

    it("reports nothing when it is replaced without having been scrolled", () => {
      withViewport(ROW_HEIGHT * 10);
      const onAnchorChange = vi.fn();
      const { unmount } = renderTable({ onAnchorChange });

      unmount();

      expect(onAnchorChange).not.toHaveBeenCalled();
    });
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
