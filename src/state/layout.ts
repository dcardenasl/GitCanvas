import { useEffect, useState } from "react";

/** Panel width limits, in pixels. */
export const SIDEBAR = { min: 160, max: 420, initial: 220 } as const;
/** Minimum, maximum, and initial widths of the inspector panel, in pixels. */
export const INSPECTOR = { min: 240, max: 620, initial: 310 } as const;

/**
 * The narrowest the history may become.
 *
 * A commit message, a short SHA and a date need roughly this much before the
 * list stops being readable, and the history is what the application is for:
 * it never gives up its last pixels to a side panel.
 */
export const HISTORY_MIN = 360;

/**
 * How wide a panel may actually be dragged right now.
 *
 * The fixed maxima above are an upper bound, not the answer: two panels at
 * their maximum add up to more than the smallest window the application
 * allows, which would leave the history with nothing. The live limit also
 * follows the window, so shrinking it pulls an over-wide panel back in rather
 * than letting it squeeze the history away.
 */
export function usableMax(
  panel: { readonly min: number; readonly max: number },
  otherPanelWidth: number,
  windowWidth: number,
): number {
  const available = windowWidth - otherPanelWidth - HISTORY_MIN;
  return Math.max(panel.min, Math.min(panel.max, available));
}

const STORAGE_KEY = "gitcanvas.layout";

interface Layout {
  sidebar: number;
  inspector: number;
}

const DEFAULTS: Layout = {
  sidebar: SIDEBAR.initial,
  inspector: INSPECTOR.initial,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Reads the stored layout, falling back to the defaults for anything unusable.
 *
 * Every value is clamped on the way in: a width written by an older build, or
 * edited by hand, must not be able to leave a panel at zero or push the
 * history off screen.
 */
function read(): Layout {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return DEFAULTS;

    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return DEFAULTS;

    const value = parsed as Partial<Record<keyof Layout, unknown>>;
    return {
      sidebar:
        typeof value.sidebar === "number" && Number.isFinite(value.sidebar)
          ? clamp(value.sidebar, SIDEBAR.min, SIDEBAR.max)
          : DEFAULTS.sidebar,
      inspector:
        typeof value.inspector === "number" && Number.isFinite(value.inspector)
          ? clamp(value.inspector, INSPECTOR.min, INSPECTOR.max)
          : DEFAULTS.inspector,
    };
  } catch {
    // Storage can be unavailable or hold something that is not JSON. Neither
    // is a reason to fail to lay out a window.
    return DEFAULTS;
  }
}

/**
 * Panel widths, remembered between sessions.
 *
 * Kept out of the session store on purpose: this is a preference about the
 * window, not state about the repository, and it must survive opening a
 * different one.
 */
export function useLayout() {
  const [layout, setLayout] = useState<Layout>(read);
  const [windowWidth, setWindowWidth] = useState(() =>
    typeof window === "undefined" ? 1280 : window.innerWidth,
  );

  useEffect(() => {
    function onResize() {
      setWindowWidth(window.innerWidth);
    }
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, []);

  /*
   * The effective widths are derived, not corrected.
   *
   * A window that shrinks can leave a stored width over the live limit. Fixing
   * that by writing state back in an effect renders twice and, worse, forgets
   * the width the user chose: growing the window again would not restore it.
   * Deriving keeps the preference intact and simply honours the room there is.
   */
  const sidebarMax = usableMax(SIDEBAR, layout.inspector, windowWidth);
  const inspectorMax = usableMax(INSPECTOR, layout.sidebar, windowWidth);
  const sidebar = Math.min(layout.sidebar, sidebarMax);
  const inspector = Math.min(layout.inspector, inspectorMax);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
    } catch {
      // A layout that cannot be persisted still works for this session.
    }
  }, [layout]);

  return {
    sidebar,
    inspector,
    sidebarMax,
    inspectorMax,
    setSidebar: (width: number) => {
      setLayout((current) => ({
        ...current,
        sidebar: clamp(width, SIDEBAR.min, sidebarMax),
      }));
    },
    setInspector: (width: number) => {
      setLayout((current) => ({
        ...current,
        inspector: clamp(width, INSPECTOR.min, inspectorMax),
      }));
    },
  };
}
