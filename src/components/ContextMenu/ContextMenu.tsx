import {
  Fragment,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import "./ContextMenu.css";

/** One action rendered as a focusable context-menu option. */
export interface MenuItem {
  readonly label: string;
  readonly onSelect: () => void;
  /**
   * The keyboard shortcut that does the same, shown beside the label. Only a
   * hint: the menu does not listen for it.
   */
  readonly shortcut?: string;
  /** Starts a new group: a rule is drawn above this item. */
  readonly startsGroup?: boolean;
}

/** Pointer position, available actions, and close callback for the menu. */
export interface ContextMenuProps {
  readonly x: number;
  readonly y: number;
  readonly items: readonly MenuItem[];
  readonly onClose: () => void;
}

/**
 * A context menu positioned at the pointer.
 *
 * Closes on Escape, on a click anywhere else, and on scroll — a menu that
 * stays anchored to a point while the list moves under it is pointing at the
 * wrong row by the time it is used.
 */
export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState({ left: 0, top: 0 });

  useLayoutEffect(() => {
    const bounds = ref.current?.getBoundingClientRect();
    if (bounds === undefined) return;
    const next = {
      left: Math.max(8, Math.min(x, window.innerWidth - bounds.width - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - bounds.height - 8)),
    };
    setPosition((previous) =>
      previous.left === next.left && previous.top === next.top
        ? previous
        : next,
    );
  }, [x, y, items]);

  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const close = useCallback((restoreFocus: boolean) => {
    if (restoreFocus && opener.current?.isConnected === true) {
      opener.current.focus();
    }
    onCloseRef.current();
  }, []);

  useLayoutEffect(() => {
    const activeElement = document.activeElement;
    opener.current =
      activeElement instanceof HTMLElement ? activeElement : null;
    ref.current?.querySelector("button")?.focus({ preventScroll: true });

    function onPointerDown(event: PointerEvent) {
      if (!ref.current?.contains(event.target as Node)) close(false);
    }
    const closeOnAnchorMove = (event: Event) => {
      // Scrolling the menu itself leaves its anchor in place, including the
      // scroll caused by focusing an item near the end of a long menu.
      if (event.target instanceof Node && ref.current?.contains(event.target))
        return;
      close(false);
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("resize", closeOnAnchorMove);
    // Opening the menu can scroll its anchor while WebKitGTK moves focus to
    // the first item. Arm scroll dismissal after the initial focus/layout frame
    // so that browser-generated opening scroll cannot immediately close it.
    const scrollFrame = window.requestAnimationFrame(() => {
      window.addEventListener("scroll", closeOnAnchorMove, true);
    });
    return () => {
      window.cancelAnimationFrame(scrollFrame);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("scroll", closeOnAnchorMove, true);
      window.removeEventListener("resize", closeOnAnchorMove);
    };
  }, [close]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (items.length === 0) return;

    let nextIndex: number | null = null;
    switch (event.key) {
      case "ArrowDown":
        nextIndex = (activeIndex + 1) % items.length;
        break;
      case "ArrowUp":
        nextIndex = (activeIndex - 1 + items.length) % items.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = items.length - 1;
        break;
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        close(true);
        return;
    }

    if (nextIndex !== null) {
      event.preventDefault();
      setActiveIndex(nextIndex);
      ref.current
        ?.querySelectorAll<HTMLButtonElement>("[role='menuitem']")
        .item(nextIndex)
        .focus();
    }
  };

  return (
    <div
      ref={ref}
      className="context-menu"
      role="menu"
      onKeyDown={onKeyDown}
      // Kept inside the window: a menu opened near the right or bottom edge
      // would otherwise open partly off screen.
      style={position}
    >
      {items.map((item, index) => (
        <Fragment key={item.label}>
          {item.startsGroup === true && index > 0 && (
            <div className="context-menu__separator" role="separator" />
          )}
          <button
            type="button"
            role="menuitem"
            tabIndex={index === activeIndex ? 0 : -1}
            className="context-menu__item"
            aria-keyshortcuts={item.shortcut}
            onClick={() => {
              try {
                item.onSelect();
              } finally {
                close(true);
              }
            }}
          >
            <span>{item.label}</span>
            {item.shortcut !== undefined && (
              // Announced through `aria-keyshortcuts`; read again as part of the
              // name, it would be said twice.
              <kbd className="context-menu__shortcut" aria-hidden="true">
                {item.shortcut}
              </kbd>
            )}
          </button>
        </Fragment>
      ))}
    </div>
  );
}
