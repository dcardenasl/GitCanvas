// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MenuAction, MenuLabels } from "../bindings";
import { changeLanguage } from "../i18n";
import { openTestProject, resetWorkspace } from "../test/workspace";

type Listener = (event: { payload: { action: MenuAction } }) => void;

const ipc = vi.hoisted(() => ({
  setMenuLabels: vi.fn(),
  onMenuAction: vi.fn(),
}));
vi.mock("../lib/ipc", () => ipc);

const { useNativeMenu } = await import("./nativeMenu");
const { useWorkspace } = await import("./workspace");

const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)";
let emit: Listener = () => undefined;
const stopListening = vi.fn();

beforeEach(async () => {
  vi.clearAllMocks();
  await changeLanguage("es");
  resetWorkspace();
  ipc.setMenuLabels.mockResolvedValue(null);
  ipc.onMenuAction.mockImplementation((listener: Listener) => {
    emit = listener;
    return Promise.resolve(stopListening);
  });
});
afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  await changeLanguage("es");
});

function onMac() {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(MAC);
}

function sentLabels(call = 0): MenuLabels {
  return ipc.setMenuLabels.mock.calls[call]?.[0] as MenuLabels;
}

describe("useNativeMenu", () => {
  it("sends the menu text in the interface language on macOS", async () => {
    onMac();
    renderHook(() => useNativeMenu(vi.fn()));

    await waitFor(() => {
      expect(ipc.setMenuLabels).toHaveBeenCalledTimes(1);
    });
    expect(sentLabels()).toMatchObject({
      file: "Archivo",
      open_folder: "Abrir carpeta…",
      close_tab: "Cerrar pestaña",
      quit: "Salir de GitCanvas",
    });
    expect(Object.values(sentLabels()).every((text) => text !== "")).toBe(true);
  });

  it("sends it again, translated, when the language changes", async () => {
    onMac();
    renderHook(() => useNativeMenu(vi.fn()));
    await waitFor(() => {
      expect(ipc.setMenuLabels).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      await changeLanguage("en");
    });

    await waitFor(() => {
      expect(ipc.setMenuLabels).toHaveBeenCalledTimes(2);
    });
    expect(sentLabels(1)).toMatchObject({
      file: "File",
      close_tab: "Close Tab",
    });
  });

  it("sends nothing where there is no menu bar to set", () => {
    renderHook(() => useNativeMenu(vi.fn()));

    expect(ipc.setMenuLabels).not.toHaveBeenCalled();
  });

  it("surfaces a failure and sets the menu up again on request", async () => {
    onMac();
    ipc.setMenuLabels.mockRejectedValueOnce(new Error("no main thread"));
    const { result } = renderHook(() => useNativeMenu(vi.fn()));
    await waitFor(() => {
      expect(result.current.error).toBeInstanceOf(Error);
    });

    act(() => {
      result.current.retry();
    });

    await waitFor(() => {
      expect(result.current.error).toBeNull();
    });
    expect(ipc.setMenuLabels).toHaveBeenCalledTimes(2);
  });

  it("asks to open a folder when the menu item is chosen", async () => {
    const openFolder = vi.fn();
    renderHook(() => useNativeMenu(openFolder));
    await waitFor(() => {
      expect(ipc.onMenuAction).toHaveBeenCalled();
    });

    emit({ payload: { action: "OpenFolder" } });

    expect(openFolder).toHaveBeenCalledTimes(1);
  });

  it("closes the active tab, and not the window, when Close Tab is chosen", async () => {
    openTestProject({ path: "/work/a", name: "a" });
    openTestProject({ path: "/work/b", name: "b" });
    renderHook(() => useNativeMenu(vi.fn()));
    await waitFor(() => {
      expect(ipc.onMenuAction).toHaveBeenCalled();
    });

    emit({ payload: { action: "CloseTab" } });

    expect(
      useWorkspace.getState().tabs.map((tab) => tab.repository.name),
    ).toEqual(["a"]);
  });

  it("uses the latest folder opener without listening again", async () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ open }) => useNativeMenu(open), {
      initialProps: { open: first },
    });
    await waitFor(() => {
      expect(ipc.onMenuAction).toHaveBeenCalledTimes(1);
    });

    rerender({ open: second });
    emit({ payload: { action: "OpenFolder" } });

    expect(ipc.onMenuAction).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("stops listening when unmounted", async () => {
    const { unmount } = renderHook(() => useNativeMenu(vi.fn()));
    await waitFor(() => {
      expect(ipc.onMenuAction).toHaveBeenCalled();
    });

    unmount();

    await waitFor(() => {
      expect(stopListening).toHaveBeenCalledTimes(1);
    });
  });
});
