// @vitest-environment jsdom
import { cleanup, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  activeRoot,
  openTestProject,
  resetWorkspace,
} from "../../test/workspace";
import { useWorkspace } from "../../state/workspace";
import { useTabShortcuts } from "./useTabShortcuts";

const names = ["a", "b", "c"];

beforeEach(() => {
  resetWorkspace();
  names.forEach((name) => openTestProject({ path: `/work/${name}`, name }));
  useWorkspace.getState().activate("/work/a");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

function mount(openFolder = vi.fn()) {
  renderHook(() => {
    useTabShortcuts(openFolder);
  });
  return openFolder;
}

function press(target: Element | Window, init: KeyboardEventInit): boolean {
  return fireEvent.keyDown(target, {
    bubbles: true,
    cancelable: true,
    ...init,
  });
}

describe("useTabShortcuts", () => {
  it("walks the row with Ctrl+Tab and Ctrl+Shift+Tab", () => {
    mount();

    press(window, { key: "Tab", ctrlKey: true });
    expect(activeRoot()).toBe("/work/b");
    press(window, { key: "Tab", ctrlKey: true, shiftKey: true });
    press(window, { key: "Tab", ctrlKey: true, shiftKey: true });
    // Home is a stop of the row, before the first project.
    expect(useWorkspace.getState().homeOpen).toBe(true);
    press(window, { key: "Tab", ctrlKey: true, shiftKey: true });
    expect(activeRoot()).toBe("/work/c");
  });

  it("jumps to a position, and to the last with 9", () => {
    mount();

    press(window, { key: "2", ctrlKey: true });
    expect(activeRoot()).toBe("/work/b");
    press(window, { key: "9", ctrlKey: true });
    expect(activeRoot()).toBe("/work/c");
  });

  it("asks to open a folder with Ctrl+O and closes the active tab with Ctrl+W", () => {
    const openFolder = mount();

    const handled = press(window, { key: "o", ctrlKey: true });
    press(window, { key: "w", ctrlKey: true });

    // The chord was claimed, so the webview does not also act on it.
    expect(handled).toBe(false);
    expect(openFolder).toHaveBeenCalledTimes(1);
    expect(useWorkspace.getState().tabs).toHaveLength(2);
    expect(activeRoot()).toBe("/work/b");
  });

  it("reopens the tab that was just closed with Ctrl+Shift+T", () => {
    mount();
    press(window, { key: "w", ctrlKey: true });
    expect(useWorkspace.getState().tabs).toHaveLength(2);

    const handled = press(window, { key: "T", ctrlKey: true, shiftKey: true });

    expect(handled).toBe(false);
    expect(useWorkspace.getState().tabs).toHaveLength(3);
    expect(activeRoot()).toBe("/work/a");
  });

  it("leaves Open and Close to a text field, but not tab walking", () => {
    const openFolder = mount();
    const field = document.createElement("input");
    document.body.append(field);

    expect(press(field, { key: "w", ctrlKey: true })).toBe(true);
    press(field, { key: "o", ctrlKey: true });
    expect(openFolder).not.toHaveBeenCalled();
    expect(useWorkspace.getState().tabs).toHaveLength(3);

    press(field, { key: "Tab", ctrlKey: true });
    expect(activeRoot()).toBe("/work/b");
  });

  it("does nothing inside a dialog, which owns the keyboard", () => {
    const openFolder = mount();
    const dialog = document.createElement("dialog");
    const button = document.createElement("button");
    dialog.append(button);
    document.body.append(dialog);

    press(button, { key: "w", ctrlKey: true });
    press(button, { key: "Tab", ctrlKey: true });

    expect(openFolder).not.toHaveBeenCalled();
    expect(activeRoot()).toBe("/work/a");
    expect(useWorkspace.getState().tabs).toHaveLength(3);
  });

  it("uses Cmd for positions on macOS and leaves Open and Close to the menu", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    );
    const openFolder = mount();

    press(window, { key: "3", metaKey: true });
    expect(activeRoot()).toBe("/work/c");
    press(window, { key: "o", metaKey: true });
    press(window, { key: "w", metaKey: true });

    expect(openFolder).not.toHaveBeenCalled();
    expect(useWorkspace.getState().tabs).toHaveLength(3);
  });

  it("stops listening once unmounted", () => {
    const { unmount } = renderHook(() => {
      useTabShortcuts(vi.fn());
    });
    unmount();

    press(window, { key: "Tab", ctrlKey: true });

    expect(activeRoot()).toBe("/work/a");
  });
});
