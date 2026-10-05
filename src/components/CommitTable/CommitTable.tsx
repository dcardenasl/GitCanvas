import { useVirtualizer } from "@tanstack/react-virtual";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { CommitInfo } from "../../bindings";
import type { RefBadge } from "../../state/refs";
import { copyText } from "../../lib/clipboard";
import { ContextMenu } from "../ContextMenu";

import { authorInitials, formatCommitTime, shortId } from "./format";
import { OVERSCAN, ROW_HEIGHT, graphWidth } from "./geometry";

import "./CommitTable.css";

/** History rows, selection, graph dimensions, and navigation callbacks. */
export interface CommitTableProps {
  readonly commits: readonly CommitInfo[];
  readonly commitIndexById?: ReadonlyMap<string, number>;
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
  /**
   * A commit to scroll into view.
   *
   * Declarative rather than an imperative handle: the caller states where the
   * history should be, and this component gets it there. An escape hatch that
   * exposed the virtualizer would let any caller drive the scroll position and
   * there would be no single place left that decides it.
   */
  readonly revealCommitId?: string | null;
  /** Called once a reveal has been carried out, so it is not repeated. */
  readonly onRevealed?: () => void;
  /**
   * Branch and tag badges, keyed by the commit they point at.
   *
   * Shown on the row rather than only in the sidebar: the whole point of a
   * graph is to see where the branches are without cross-referencing a list.
   */
  readonly refsByCommit?: ReadonlyMap<string, readonly RefBadge[]>;
}

/** Inclusive row range currently mounted, plus the total scrolled height. */
export interface VisibleWindow {
  readonly startIndex: number;
  readonly endIndex: number;
  readonly totalHeight: number;
}

/** A spoken description of a row: what it is, who wrote it, and when. */
function rowLabel(
  commit: CommitInfo,
  refs: readonly RefBadge[] | undefined,
): string {
  const parts = [commit.summary];
  if (refs !== undefined && refs.length > 0) {
    parts.push(`en ${refs.map((ref) => ref.name).join(", ")}`);
  }
  parts.push(`por ${commit.author_name}`);
  parts.push(formatCommitTime(commit.commit_time));
  parts.push(`commit ${shortId(commit.id)}`);
  return parts.join(". ");
}

/**
 * The commit history, virtualized.
 *
 * Only the rows in view plus an overscan margin are mounted, so a repository
 * with a hundred thousand commits costs the same as one with fifty.
 */
export function CommitTable({
  commits,
  commitIndexById: suppliedCommitIndex,
  selectedId,
  onSelect,
  maxLanes,
  renderGraph,
  onReachEnd,
  revealCommitId = null,
  onRevealed,
  refsByCommit,
}: CommitTableProps) {
  const commitIndexById = useMemo(() => {
    if (suppliedCommitIndex !== undefined) return suppliedCommitIndex;
    const index = new Map<string, number>();
    commits.forEach((commit, position) => {
      index.set(commit.id, position);
    });
    return index;
  }, [commits, suppliedCommitIndex]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef(new Map<number, HTMLDivElement>());
  const pendingFocusIndex = useRef<number | null>(null);
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    commit: CommitInfo;
  } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const closeMenu = useCallback(() => {
    setMenu(null);
  }, []);

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

  useEffect(() => {
    if (revealCommitId === null) return;

    const index = commitIndexById.get(revealCommitId);
    // Not loaded yet: the caller keeps fetching pages, and this runs again
    // when they arrive. Doing nothing here is what makes that safe to retry.
    if (index === undefined) return;

    virtualizer.scrollToIndex(index, { align: "center" });
    onRevealed?.();
  }, [revealCommitId, commitIndexById, virtualizer, onRevealed]);

  const copy = useCallback(async (value: string, what: string) => {
    const ok = await copyText(value);
    setCopied(ok ? `${what} copiado` : `no se pudo copiar el ${what}`);
    // Cleared so the same copy announced twice in a row is announced twice.
    window.setTimeout(() => {
      setCopied(null);
    }, 2500);
  }, []);

  const items = virtualizer.getVirtualItems();
  const totalHeight = virtualizer.getTotalSize();
  const selectedIndex =
    selectedId === null ? -1 : (commitIndexById.get(selectedId) ?? -1);

  const first = items[0];
  const last = items[items.length - 1];

  // Ask for the next page once the last row is mounted, which the overscan
  // margin makes happen before the user gets there. Done in an effect: asking
  // is a side effect, and a render must be free to run twice or be discarded
  // without triggering a request each time.
  const reachedEnd = last !== undefined && last.index >= commits.length - 1;
  const onReachEndRef = useRef(onReachEnd);
  useEffect(() => {
    onReachEndRef.current = onReachEnd;
  });
  useEffect(() => {
    // Also re-runs when a page arrives, so a viewport taller than the rows
    // loaded so far keeps asking until it is full or the history ends.
    if (reachedEnd) onReachEndRef.current?.();
  }, [reachedEnd, commits.length]);

  useEffect(() => {
    const pending = pendingFocusIndex.current;
    if (pending === null) return;
    const row = rowRefs.current.get(pending);
    if (row !== undefined) {
      row.focus();
      pendingFocusIndex.current = null;
    }
  }, [items, selectedId]);

  const handleKeyDown = useCallback(
    (
      event: React.KeyboardEvent<HTMLDivElement>,
      index: number,
      commit: CommitInfo,
    ) => {
      if (
        event.key === "ContextMenu" ||
        (event.key === "F10" && event.shiftKey)
      ) {
        event.preventDefault();
        onSelect(commit.id);
        const bounds = event.currentTarget.getBoundingClientRect();
        setMenu({ x: bounds.left, y: bounds.bottom, commit });
        return;
      }

      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onSelect(commit.id);
        return;
      }

      let next: number;
      switch (event.key) {
        case "ArrowDown":
          next = index + 1;
          break;
        case "ArrowUp":
          next = index - 1;
          break;
        case "Home":
          next = 0;
          break;
        case "End":
          next = commits.length - 1;
          break;
        case "PageDown":
          next =
            index +
            Math.max(
              1,
              Math.floor(
                (scrollRef.current?.clientHeight ?? ROW_HEIGHT) / ROW_HEIGHT,
              ),
            );
          break;
        case "PageUp":
          next =
            index -
            Math.max(
              1,
              Math.floor(
                (scrollRef.current?.clientHeight ?? ROW_HEIGHT) / ROW_HEIGHT,
              ),
            );
          break;
        default:
          return;
      }
      event.preventDefault();
      next = Math.max(0, Math.min(next, commits.length - 1));
      const target = commits[next];
      if (target === undefined) return;

      pendingFocusIndex.current = next;
      onSelect(target.id);
      virtualizer.scrollToIndex(next);
      const row = rowRefs.current.get(next);
      if (row !== undefined) {
        row.focus();
        pendingFocusIndex.current = null;
      }
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
          // The width the graph column needs. Applied to each row's `left`
          // rather than as padding here: rows are absolutely positioned, and an
          // absolutely positioned box resolves `left` against the padding box,
          // so padding on this container would be ignored and the graph would
          // be drawn straight through the commit messages.
          style={
            {
              "--graph-width": `${String(graphWidth(maxLanes))}px`,
            } as React.CSSProperties
          }
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
                /*
                 * Without this the accessible name is whatever the DOM
                 * concatenates — "…2e53be608-sept, 04:56 p.m." — which reads
                 * the hash straight into the date. Naming the row explicitly
                 * puts the separators a listener needs.
                 */
                aria-label={rowLabel(commit, refsByCommit?.get(commit.id))}
                tabIndex={
                  selected ||
                  item.index === (selectedIndex < 0 ? 0 : selectedIndex)
                    ? 0
                    : -1
                }
                ref={(element) => {
                  if (element === null) rowRefs.current.delete(item.index);
                  else rowRefs.current.set(item.index, element);
                }}
                onClick={() => {
                  onSelect(commit.id);
                }}
                onKeyDown={(event) => {
                  handleKeyDown(event, item.index, commit);
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  onSelect(commit.id);
                  setMenu({ x: event.clientX, y: event.clientY, commit });
                }}
                style={{
                  height: `${String(ROW_HEIGHT)}px`,
                  transform: `translateY(${String(item.start)}px)`,
                }}
              >
                <span className="commit-row__message">
                  {(refsByCommit?.get(commit.id) ?? []).map((ref) => (
                    <span
                      key={`${ref.kind}/${ref.name}`}
                      className={`ref-pill ref-pill--${ref.kind}${
                        ref.isHead ? " ref-pill--head" : ""
                      }`}
                      title={
                        ref.isHead ? `${ref.name} (rama activa)` : ref.name
                      }
                    >
                      {ref.name}
                    </span>
                  ))}
                  <span className="commit-row__summary" title={commit.summary}>
                    {commit.summary}
                  </span>
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

      {menu !== null && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={closeMenu}
          items={[
            {
              label: `Copiar hash (${shortId(menu.commit.id)})`,
              onSelect: () => {
                void copy(menu.commit.id, "hash");
              },
            },
            {
              label: "Copiar hash completo",
              onSelect: () => {
                void copy(menu.commit.id, "hash completo");
              },
            },
            {
              label: "Copiar mensaje",
              onSelect: () => {
                void copy(menu.commit.message, "mensaje");
              },
            },
            {
              label: "Copiar autor",
              onSelect: () => {
                void copy(
                  `${menu.commit.author_name} <${menu.commit.author_email}>`,
                  "autor",
                );
              },
            },
          ]}
        />
      )}

      {/* Announced rather than shown as a toast: the confirmation matters to
          anyone who cannot see the clipboard change, and a visual flash in the
          corner would be missed by everyone else anyway. */}
      <span className="commit-table__announcement" role="status">
        {copied}
      </span>
    </div>
  );
}
