import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { StashAnchorEntry } from "../../bindings";
import { stashDate } from "../StashView/metadata";

const PAGE_SIZE = 50;

/** An accessible, bounded picker for the unique stashes based at one commit. */
export function StashAnchor({
  entries,
  activeStashId,
  onSelect,
}: {
  readonly entries: readonly StashAnchorEntry[];
  readonly activeStashId: string | null;
  readonly onSelect: (entry: StashAnchorEntry["entry"]) => void;
}) {
  const { t } = useTranslation("stash");
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [position, setPosition] = useState({ left: 8, top: 8 });
  const pageCount = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = entries.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE,
  );

  useLayoutEffect(() => {
    if (!open || trigger.current === null) return;
    const bounds = trigger.current.getBoundingClientRect();
    const panelBounds = panel.current?.getBoundingClientRect();
    const width = panelBounds?.width ?? 320;
    const height = panelBounds?.height ?? 240;
    setPosition({
      left: Math.max(8, Math.min(bounds.left, window.innerWidth - width - 8)),
      top: Math.max(
        8,
        Math.min(bounds.bottom + 4, window.innerHeight - height - 8),
      ),
    });
  }, [open, currentPage, entries]);

  useLayoutEffect(() => {
    if (!open) return;
    panel.current
      ?.querySelector<HTMLButtonElement>("[data-stash-choice]")
      ?.focus({ preventScroll: true });
    const dismiss = (event: Event) => {
      if (
        event.target instanceof Node &&
        (panel.current?.contains(event.target) ||
          trigger.current?.contains(event.target))
      )
        return;
      setOpen(false);
      trigger.current?.focus({ preventScroll: true });
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        trigger.current?.focus({ preventScroll: true });
      }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", keydown);
    const closeOnAnchorMove = (event: Event) => {
      if (event.target instanceof Node && panel.current?.contains(event.target))
        return;
      setOpen(false);
      trigger.current?.focus({ preventScroll: true });
    };
    window.addEventListener("scroll", closeOnAnchorMove, true);
    window.addEventListener("resize", closeOnAnchorMove);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", keydown);
      window.removeEventListener("scroll", closeOnAnchorMove, true);
      window.removeEventListener("resize", closeOnAnchorMove);
    };
  }, [open]);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={`stash-anchor${activeStashId !== null && entries.some(({ entry }) => entry.stash_id === activeStashId) ? " stash-anchor--active" : ""}`}
        aria-label={t("graph.count", { count: entries.length })}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          setPage(0);
          setOpen((value) => !value);
        }}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path d="M4 3v10m0-7h5a3 3 0 0 1 0 6H7m5-8v2" />
        </svg>
        <span>{entries.length}</span>
      </button>
      {open &&
        createPortal(
          <div
            ref={panel}
            className="stash-anchor-popover"
            role="dialog"
            aria-label={t("graph.title")}
            style={{ left: position.left, top: position.top }}
          >
            <div className="stash-anchor-popover__list">
              {visible.map(({ entry }) => (
                <button
                  key={entry.stash_id}
                  type="button"
                  data-stash-choice
                  className="stash-anchor-popover__entry"
                  onClick={(event) => {
                    event.stopPropagation();
                    setOpen(false);
                    onSelect(entry);
                  }}
                >
                  <span className="stash-anchor-popover__message">
                    {entry.message ?? t("noMessage")}
                  </span>
                  <span className="stash-anchor-popover__meta">
                    {t("graph.alias", { index: entry.index })} ·{" "}
                    {stashDate(entry) ?? t("dateInvalid")}
                  </span>
                </button>
              ))}
            </div>
            {pageCount > 1 && (
              <div className="stash-anchor-popover__pager">
                <button
                  type="button"
                  disabled={currentPage === 0}
                  onClick={() => {
                    setPage(currentPage - 1);
                  }}
                >
                  {t("graph.previous")}
                </button>
                <span>
                  {t("graph.page", { page: currentPage + 1, pages: pageCount })}
                </span>
                <button
                  type="button"
                  disabled={currentPage + 1 === pageCount}
                  onClick={() => {
                    setPage(currentPage + 1);
                  }}
                >
                  {t("graph.next")}
                </button>
              </div>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
