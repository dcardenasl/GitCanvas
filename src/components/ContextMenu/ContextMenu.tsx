import { useCallback, useLayoutEffect, useRef, useState } from "react";

import "./ContextMenu.css";

/** One action rendered as a focusable context-menu option. */
export interface MenuItem {
  readonly label: string;
  readonly onSelect: () => void;
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
    ref.current?.querySelector("button")?.focus();

    function onPointerDown(event: PointerEvent) {
      if (!ref.current?.contains(event.target as Node)) close(false);
    }
    const closeOnAnchorMove = () => {
      close(false);
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("scroll", closeOnAnchorMove, true);
    window.addEventListener("resize", closeOnAnchorMove);
    return () => {
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
      style={{
        left: Math.min(x, window.innerWidth - 220),
        top: Math.min(y, window.innerHeight - items.length * 30 - 12),
      }}
    >
      {items.map((item, index) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          tabIndex={index === activeIndex ? 0 : -1}
          className="context-menu__item"
          onClick={() => {
            try {
              item.onSelect();
            } finally {
              close(true);
            }
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
