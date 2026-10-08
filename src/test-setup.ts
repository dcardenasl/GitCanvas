/**
 * Test environment shims.
 *
 * Only applies to suites running under jsdom; the `node` suites — the graph
 * layout among them — see none of this, which is the point. Guarding on
 * `window` keeps the pure tests genuinely DOM-free.
 */
if (typeof window !== "undefined") {
  // jsdom implements no layout engine, so every element measures zero and a
  // virtualizer concludes nothing is visible. These give tests a real viewport.
  if (!("ResizeObserver" in window)) {
    class ResizeObserverShim {
      observe(): void {
        // Sizes never change during a test, so there is nothing to report.
      }
      unobserve(): void {
        /* no-op */
      }
      disconnect(): void {
        /* no-op */
      }
    }
    Object.defineProperty(window, "ResizeObserver", {
      writable: true,
      configurable: true,
      value: ResizeObserverShim,
    });
  }

  for (const [prop, value] of [
    ["offsetHeight", 400],
    ["offsetWidth", 800],
    ["clientHeight", 400],
    ["clientWidth", 800],
  ] as const) {
    Object.defineProperty(window.HTMLElement.prototype, prop, {
      configurable: true,
      get: () => value,
    });
  }

  window.HTMLElement.prototype.scrollTo = () => {
    /* jsdom has no scrolling; the virtualizer only needs the call to exist. */
  };
}
