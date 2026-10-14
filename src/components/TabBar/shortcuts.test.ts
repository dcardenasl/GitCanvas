// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { isTextEntry, tabShortcut, type Chord } from "./shortcuts";

function chord(key: string, held: Partial<Chord> = {}): Chord {
  return {
    key,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    ...held,
  };
}

describe("tabShortcut", () => {
  it.each([true, false])("walks the row with Ctrl+Tab (mac: %s)", (mac) => {
    expect(tabShortcut(chord("Tab", { ctrlKey: true }), mac, false)).toEqual({
      kind: "next",
    });
    expect(
      tabShortcut(chord("Tab", { ctrlKey: true, shiftKey: true }), mac, false),
    ).toEqual({ kind: "previous" });
  });

  it("walks the row even while typing, since the chord means nothing to a field", () => {
    expect(tabShortcut(chord("Tab", { ctrlKey: true }), false, true)).toEqual({
      kind: "next",
    });
  });

  it("jumps to a position with Cmd on macOS and Ctrl elsewhere", () => {
    expect(tabShortcut(chord("3", { metaKey: true }), true, false)).toEqual({
      kind: "position",
      position: 3,
    });
    expect(tabShortcut(chord("3", { ctrlKey: true }), false, false)).toEqual({
      kind: "position",
      position: 3,
    });
    expect(tabShortcut(chord("9", { ctrlKey: true }), false, true)).toEqual({
      kind: "position",
      position: 9,
    });
  });

  it("does not take the other platform's modifier", () => {
    expect(tabShortcut(chord("3", { ctrlKey: true }), true, false)).toBeNull();
    expect(tabShortcut(chord("3", { metaKey: true }), false, false)).toBeNull();
  });

  it.each(["0", "a", "Enter"])("ignores %s as a position", (key) => {
    expect(tabShortcut(chord(key, { ctrlKey: true }), false, false)).toBeNull();
  });

  it("opens and closes with Ctrl+O and Ctrl+W off macOS", () => {
    expect(tabShortcut(chord("o", { ctrlKey: true }), false, false)).toEqual({
      kind: "open",
    });
    expect(tabShortcut(chord("W", { ctrlKey: true }), false, false)).toEqual({
      kind: "close",
    });
  });

  it("leaves open and close to the field while typing", () => {
    expect(tabShortcut(chord("o", { ctrlKey: true }), false, true)).toBeNull();
    expect(tabShortcut(chord("w", { ctrlKey: true }), false, true)).toBeNull();
  });

  it("leaves open and close to the native menu on macOS", () => {
    expect(tabShortcut(chord("o", { metaKey: true }), true, false)).toBeNull();
    expect(tabShortcut(chord("w", { metaKey: true }), true, false)).toBeNull();
  });

  it("ignores a chord with extra modifiers", () => {
    expect(
      tabShortcut(chord("1", { ctrlKey: true, shiftKey: true }), false, false),
    ).toBeNull();
    expect(
      tabShortcut(chord("w", { ctrlKey: true, altKey: true }), false, false),
    ).toBeNull();
    expect(
      tabShortcut(chord("Tab", { ctrlKey: true, altKey: true }), false, false),
    ).toBeNull();
  });

  it("ignores plain keys", () => {
    expect(tabShortcut(chord("w"), false, false)).toBeNull();
    expect(tabShortcut(chord("Tab"), false, false)).toBeNull();
  });
});

describe("isTextEntry", () => {
  function field(html: string): HTMLElement {
    const host = document.createElement("div");
    host.innerHTML = html;
    document.body.append(host);
    const element = host.firstElementChild;
    if (!(element instanceof HTMLElement)) throw new Error("no element");
    return element;
  }

  it.each([
    '<input type="text">',
    '<input type="search">',
    '<input type="password">',
    "<input>",
    "<textarea></textarea>",
  ])("is true for %s", (html) => {
    expect(isTextEntry(field(html))).toBe(true);
  });

  it.each([
    '<input type="checkbox">',
    "<button></button>",
    "<select></select>",
    "<div></div>",
  ])("is false for %s", (html) => {
    expect(isTextEntry(field(html))).toBe(false);
  });

  it("is false for nothing at all", () => {
    expect(isTextEntry(null)).toBe(false);
  });
});
