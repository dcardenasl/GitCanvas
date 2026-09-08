import { useCallback, useEffect, useRef } from "react";

import "./Resizer.css";

export interface ResizerProps {
  /** Accessible name, e.g. "Ancho de la barra lateral". */
  readonly label: string;
  readonly width: number;
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
  min,
  max,
  grows,
  onResize,
  hidden = false,
}: ResizerProps) {
  const dragging = useRef<{ startX: number; startWidth: number } | null>(null);

  const clamp = useCallback(
    (value: number) => Math.min(Math.max(value, min), max),
    [min, max],
  );

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragging.current = { startX: event.clientX, startWidth: width };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragging.current;
    if (drag === null) return;

    const delta = event.clientX - drag.startX;
    onResize(clamp(drag.startWidth + (grows === "right" ? delta : -delta)));
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragging.current = null;
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const towards =
      event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
    if (towards === 0) return;

    event.preventDefault();
    onResize(clamp(width + towards * STEP * (grows === "right" ? 1 : -1)));
  };

  useEffect(() => {
    // A drag in progress must not leave text selected across the window.
    if (dragging.current === null) return;
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.userSelect = "";
    };
  });

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
        // Double click restores the default, so a divider dragged into a
        // useless position is always one gesture from being fixed.
        onResize(clamp((min + max) / 2));
      }}
    />
  );
}
