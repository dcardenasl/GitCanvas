import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useRef, type ReactNode } from "react";

import type { CommitInfo } from "../../bindings";

import { authorInitials, formatCommitTime, shortId } from "./format";
import { OVERSCAN, ROW_HEIGHT, graphWidth } from "./geometry";

import "./CommitTable.css";

export interface CommitTableProps {
  readonly commits: readonly CommitInfo[];
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
  /** Widest lane count seen so far; sizes the graph column. */
  readonly maxLanes: number;
  /**
   * Graph layer, absolutely positioned over the same scrolled content.
   *
   * Rendered as a child rather than composed outside so that it shares this
   * component's single scroll container: two synchronized containers drift by
   * a frame on every scroll, and the code that syncs them cannot fail if it
   * does not exist. Receives the visible row window so it only draws what is
   * on screen.
   */
  readonly renderGraph?: (window: VisibleWindow) => ReactNode;
  /** Called when the last rows come into view, to request the next page. */
  readonly onReachEnd?: () => void;
}

/** Inclusive row range currently mounted, plus the total scrolled height. */
export interface VisibleWindow {
  readonly startIndex: number;
  readonly endIndex: number;
  readonly totalHeight: number;
}

/**
 * The commit history, virtualized.
 *
 * Only the rows in view plus an overscan margin are mounted, so a repository
 * with a hundred thousand commits costs the same as one with fifty.
 */
export function CommitTable({
  commits,
  selectedId,
  onSelect,
  maxLanes,
  renderGraph,
  onReachEnd,
}: CommitTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // The virtualizer keeps mutable internal state that the React Compiler
  // cannot reason about, so it flags the call. That is inherent to how the
  // library works, not something this component can restructure away.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: commits.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN,
    getItemKey: (index) => commits[index]?.id ?? index,
  });

  const items = virtualizer.getVirtualItems();
  const totalHeight = virtualizer.getTotalSize();

  const first = items[0];
  const last = items[items.length - 1];

  // Ask for the next page once the tail is within the overscan margin, so the
  // rows are already there by the time the user scrolls into them.
  if (last !== undefined && onReachEnd && last.index >= commits.length - 1) {
    queueMicrotask(onReachEnd);
  }

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>, index: number) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      event.preventDefault();

      const next = event.key === "ArrowDown" ? index + 1 : index - 1;
      const target = commits[next];
      if (target === undefined) return;

      onSelect(target.id);
      virtualizer.scrollToIndex(next);
    },
    [commits, onSelect, virtualizer],
  );

  return (
    <div className="commit-table" ref={scrollRef}>
      <div
        className="commit-table__content"
        style={{ height: `${String(totalHeight)}px` }}
      >
        {renderGraph !== undefined && first !== undefined && last !== undefined
          ? renderGraph({
              startIndex: first.index,
              endIndex: last.index,
              totalHeight,
            })
          : null}

        <div
          className="commit-table__rows"
          role="listbox"
          aria-label="Historial de commits"
          style={{ paddingLeft: `${String(graphWidth(maxLanes))}px` }}
        >
          {items.map((item) => {
            const commit = commits[item.index];
            if (commit === undefined) return null;

            const selected = commit.id === selectedId;

            return (
              <div
                key={item.key}
                className={
                  selected ? "commit-row commit-row--selected" : "commit-row"
                }
                role="option"
                aria-selected={selected}
                tabIndex={selected ? 0 : -1}
                onClick={() => {
                  onSelect(commit.id);
                }}
                onKeyDown={(event) => {
                  handleKeyDown(event, item.index);
                }}
                style={{
                  height: `${String(ROW_HEIGHT)}px`,
                  transform: `translateY(${String(item.start)}px)`,
                }}
              >
                <span className="commit-row__summary" title={commit.summary}>
                  {commit.summary}
                </span>
                <span className="commit-row__author">
                  <span className="commit-row__avatar" aria-hidden="true">
                    {authorInitials(commit.author_name)}
                  </span>
                  {commit.author_name}
                </span>
                <span className="commit-row__sha">{shortId(commit.id)}</span>
                <time className="commit-row__date">
                  {formatCommitTime(commit.commit_time)}
                </time>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
