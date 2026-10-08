// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { INSPECTOR, SIDEBAR, useLayout } from "./layout";

const KEY = "gitcanvas.layout";

function setWindowWidth(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width,
  });
}

beforeEach(() => {
  localStorage.clear();
  setWindowWidth(1600);
});

describe("useLayout", () => {
  it("starts from the defaults when nothing is stored", () => {
    const { result } = renderHook(() => useLayout());

    expect(result.current.sidebar).toBe(SIDEBAR.initial);
    expect(result.current.inspector).toBe(INSPECTOR.initial);
  });

  it("restores widths a previous session saved", () => {
    localStorage.setItem(KEY, JSON.stringify({ sidebar: 300, inspector: 400 }));

    const { result } = renderHook(() => useLayout());

    expect(result.current.sidebar).toBe(300);
    expect(result.current.inspector).toBe(400);
  });

  it("clamps stored widths that would leave a panel unusable", () => {
    localStorage.setItem(KEY, JSON.stringify({ sidebar: 0, inspector: 99999 }));

    const { result } = renderHook(() => useLayout());

    expect(result.current.sidebar).toBe(SIDEBAR.min);
    expect(result.current.inspector).toBe(INSPECTOR.max);
  });

  it.each([
    ["not json", "{oops"],
    ["not an object", "42"],
    ["null", "null"],
  ])("falls back to the defaults when the stored value is %s", (_name, raw) => {
    localStorage.setItem(KEY, raw);

    const { result } = renderHook(() => useLayout());

    expect(result.current.sidebar).toBe(SIDEBAR.initial);
  });

  it("falls back per field when only one is unusable", () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ sidebar: "wide", inspector: 350 }),
    );

    const { result } = renderHook(() => useLayout());

    expect(result.current.sidebar).toBe(SIDEBAR.initial);
    expect(result.current.inspector).toBe(350);
  });

  it("clamps a drag to the limits and remembers it", () => {
    const { result } = renderHook(() => useLayout());

    act(() => {
      result.current.setSidebar(10_000);
    });
    expect(result.current.sidebar).toBe(result.current.sidebarMax);

    act(() => {
      result.current.setInspector(300);
    });
    expect(result.current.inspector).toBe(300);
    expect(JSON.parse(localStorage.getItem(KEY) ?? "{}")).toMatchObject({
      inspector: 300,
    });
  });

  it("honours a smaller window without forgetting the width the user chose", () => {
    localStorage.setItem(KEY, JSON.stringify({ sidebar: 400, inspector: 600 }));
    const { result } = renderHook(() => useLayout());
    expect(result.current.sidebar).toBe(400);

    act(() => {
      setWindowWidth(1000);
      window.dispatchEvent(new Event("resize"));
    });
    expect(result.current.sidebar).toBeLessThan(400);

    act(() => {
      setWindowWidth(1600);
      window.dispatchEvent(new Event("resize"));
    });
    expect(result.current.sidebar).toBe(400);
  });
});
