import { useCallback, useEffect, useRef } from "react";

import "./Resizer.css";

/** Accessible bounds and callbacks for a draggable panel divider. */
export interface ResizerProps {
  /** Accessible name, e.g. "Ancho de la barra lateral". */
  readonly label: string;
  readonly width: number;
  /** Width restored by double-click, before the user resized this panel. */
  readonly initialWidth: number;
  readonly min: number;
  readonly max: number;
  /** Which way a wider panel grows, so the drag direction matches the panel. */
  readonly grows: "right" | "left";
  readonly onResize: (width: number) => void;
  /**
   * Takes the divider out of reach without taking it out of the grid.
   *
   * `[hidden]` is styled to zero width rather than `display: none`, because a
   * removed grid child shifts every later one into the wrong column.
   */
  readonly hidden?: boolean;
}

/** How much one arrow key press moves the divider, in pixels. */
const STEP = 16;

/**
 * A draggable divider between two panels.
 *
 * Implemented as a `separator` with `aria-valuenow` rather than a bare div, so
 * the width is adjustable from the keyboard and announced. A divider that only
 * responds to a mouse is not a control, it is decoration that happens to work.
 *
 * Pointer capture rather than window listeners: the drag keeps following the
 * pointer when it leaves the divider, and releases even if the pointer comes
 * up outside the window, which is where a hand-rolled mousemove/mouseup pair
 * usually leaks a stuck drag.
 */
export function Resizer({
  label,
  width,
  initialWidth,
  min,
  max,
  grows,
  onResize,
  hidden = false,
}: ResizerProps) {
  const dragging = useRef<{
    pointerId: number;
    startX: number;
    startWidth: number;
  } | null>(null);
  const previousUserSelect = useRef<string | null>(null);

  const clamp = useCallback(
    (value: number) => Math.min(Math.max(value, min), max),
    [min, max],
  );

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || dragging.current !== null) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragging.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: width,
    };
    previousUserSelect.current = document.body.style.userSelect;
    document.body.style.userSelect = "none";
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragging.current;
    if (drag?.pointerId !== event.pointerId) return;

    const delta = event.clientX - drag.startX;
    onResize(clamp(drag.startWidth + (grows === "right" ? delta : -delta)));
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragging.current;
    if (drag?.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragging.current = null;
    if (previousUserSelect.current !== null) {
      document.body.style.userSelect = previousUserSelect.current;
      previousUserSelect.current = null;
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const towards =
      event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
    if (towards === 0) return;

    event.preventDefault();
    onResize(clamp(width + towards * STEP * (grows === "right" ? 1 : -1)));
  };

  useEffect(
    () => () => {
      // Unmounting during a drag must restore the value that was there before
      // the gesture, including an application-level text-selection policy.
      if (previousUserSelect.current !== null) {
        document.body.style.userSelect = previousUserSelect.current;
        previousUserSelect.current = null;
      }
      dragging.current = null;
    },
    [],
  );

  return (
    <div
      className="resizer"
      hidden={hidden}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={Math.round(width)}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={hidden ? -1 : 0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
      onDoubleClick={() => {
        onResize(clamp(initialWidth));
      }}
    />
  );
}
