import { describe, expect, it } from "vitest";

import { HISTORY_MIN, INSPECTOR, SIDEBAR, usableMax } from "./layout";

/**
 * The clamping contract, exercised through the module's own limits.
 *
 * These bounds are what stop a stored width from leaving a panel at zero or
 * pushing the history off screen, so they are asserted rather than assumed.
 */
describe("layout limits", () => {
  it("keeps every panel usable at its smallest", () => {
    expect(SIDEBAR.min).toBeGreaterThan(0);
    expect(INSPECTOR.min).toBeGreaterThan(0);
  });

  it("starts within its own bounds", () => {
    expect(SIDEBAR.initial).toBeGreaterThanOrEqual(SIDEBAR.min);
    expect(SIDEBAR.initial).toBeLessThanOrEqual(SIDEBAR.max);
    expect(INSPECTOR.initial).toBeGreaterThanOrEqual(INSPECTOR.min);
    expect(INSPECTOR.initial).toBeLessThanOrEqual(INSPECTOR.max);
  });

  it("never lets a panel take the history's last pixels", () => {
    // The smallest window the application allows is 940px, set in
    // tauri.conf.json. Both fixed maxima together exceed it, which is exactly
    // why the live limit exists.
    const narrow = 940;
    const sidebar = usableMax(SIDEBAR, INSPECTOR.initial, narrow);
    const inspector = usableMax(INSPECTOR, sidebar, narrow);

    expect(narrow - sidebar - inspector).toBeGreaterThanOrEqual(HISTORY_MIN);
  });

  it("still allows the minimum width when the window is tiny", () => {
    // Squeezed past what it can honour, the limit falls back to the panel's
    // own minimum rather than returning something narrower than it can render.
    expect(usableMax(SIDEBAR, 900, 500)).toBe(SIDEBAR.min);
  });

  it("grows the limit as the window grows, up to the fixed maximum", () => {
    expect(usableMax(SIDEBAR, INSPECTOR.initial, 900)).toBeLessThan(
      SIDEBAR.max,
    );
    expect(usableMax(SIDEBAR, INSPECTOR.initial, 2400)).toBe(SIDEBAR.max);
  });
});
