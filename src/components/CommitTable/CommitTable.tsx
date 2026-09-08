import { useVirtualizer } from "@tanstack/react-virtual";
import {
  useCallback,
  useEffect,
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

/**
 * The commit history, virtualized.
 *
 * Only the rows in view plus an overscan margin are mounted, so a repository
 * with a hundred thousand commits costs the same as one with fifty.
 */
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

export function CommitTable({
  commits,
  selectedId,
  onSelect,
  maxLanes,
  renderGraph,
  onReachEnd,
  revealCommitId = null,
  onRevealed,
  refsByCommit,
}: CommitTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
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

    const index = commits.findIndex((commit) => commit.id === revealCommitId);
    // Not loaded yet: the caller keeps fetching pages, and this runs again
    // when they arrive. Doing nothing here is what makes that safe to retry.
    if (index < 0) return;

    virtualizer.scrollToIndex(index, { align: "center" });
    onRevealed?.();
  }, [revealCommitId, commits, virtualizer, onRevealed]);

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
                tabIndex={selected ? 0 : -1}
                onClick={() => {
                  onSelect(commit.id);
                }}
                onKeyDown={(event) => {
                  handleKeyDown(event, item.index);
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
