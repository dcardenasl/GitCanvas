// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Payload =
  { type: "enter" | "over" | "drop"; paths: string[] } | { type: "leave" };
type Handler = (event: { payload: Payload }) => void;

const webview = vi.hoisted(() => ({
  onDragDropEvent: vi.fn(),
}));
vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => webview,
}));

const { useDroppedFolders } = await import("./useDroppedFolders");

let emit: Handler = () => undefined;
const stop = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  webview.onDragDropEvent.mockImplementation((handler: Handler) => {
    emit = handler;
    return Promise.resolve(stop);
  });
});
afterEach(cleanup);

describe("useDroppedFolders", () => {
  it("is over while a drag is above the window and not once it leaves", async () => {
    const { result } = renderHook(() => useDroppedFolders(vi.fn()));
    await waitFor(() => {
      expect(webview.onDragDropEvent).toHaveBeenCalled();
    });
    expect(result.current).toBe(false);

    act(() => {
      emit({ payload: { type: "enter", paths: ["/a"] } });
    });
    expect(result.current).toBe(true);
    act(() => {
      emit({ payload: { type: "over", paths: ["/a"] } });
    });
    expect(result.current).toBe(true);
    act(() => {
      emit({ payload: { type: "leave" } });
    });
    expect(result.current).toBe(false);
  });

  it("hands over the dropped paths in order and is no longer over", async () => {
    const onDrop = vi.fn();
    const { result } = renderHook(() => useDroppedFolders(onDrop));
    await waitFor(() => {
      expect(webview.onDragDropEvent).toHaveBeenCalled();
    });
    act(() => {
      emit({ payload: { type: "enter", paths: ["/a", "/b"] } });
    });

    act(() => {
      emit({ payload: { type: "drop", paths: ["/a", "/b"] } });
    });

    expect(onDrop).toHaveBeenCalledWith(["/a", "/b"]);
    expect(result.current).toBe(false);
  });

  it("calls the newest handler without listening again", async () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(
      ({ handler }) => useDroppedFolders(handler),
      {
        initialProps: { handler: first },
      },
    );
    await waitFor(() => {
      expect(webview.onDragDropEvent).toHaveBeenCalledTimes(1);
    });

    rerender({ handler: second });
    act(() => {
      emit({ payload: { type: "drop", paths: ["/a"] } });
    });

    expect(webview.onDragDropEvent).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith(["/a"]);
  });

  it("stops listening when unmounted", async () => {
    const { unmount } = renderHook(() => useDroppedFolders(vi.fn()));
    await waitFor(() => {
      expect(webview.onDragDropEvent).toHaveBeenCalled();
    });

    unmount();

    await waitFor(() => {
      expect(stop).toHaveBeenCalledTimes(1);
    });
  });

  it("stops a listener that finished registering after it was unmounted", async () => {
    let finish: (cleanup: () => void) => void = () => undefined;
    webview.onDragDropEvent.mockReturnValue(
      new Promise<() => void>((resolve) => {
        finish = resolve;
      }),
    );
    const { unmount } = renderHook(() => useDroppedFolders(vi.fn()));
    unmount();

    finish(stop);

    await waitFor(() => {
      expect(stop).toHaveBeenCalledTimes(1);
    });
  });
});
