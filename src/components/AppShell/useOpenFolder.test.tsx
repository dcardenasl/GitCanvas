// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createIpcMocks } from "../../test/test-utils";

const open = vi.fn<(options: unknown) => Promise<string | null>>();
const mockIpc = createIpcMocks(["openRepository"] as const);
const { openRepository } = mockIpc;

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (options: unknown) => open(options),
}));
vi.mock("../../lib/ipc", () => mockIpc);

const { useOpenFolder } = await import("./useOpenFolder");
const { useWorkspace } = await import("../../state/workspace");
const { openTestProject, resetWorkspace, TEST_LIMITS } =
  await import("../../test/workspace");

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  resetWorkspace();
  openRepository.mockImplementation((path: string) =>
    Promise.resolve({ path, name: path.split("/").pop() ?? path }),
  );
});
afterEach(cleanup);

const roots = () =>
  useWorkspace.getState().tabs.map((tab) => tab.repository.path);

describe("useOpenFolder.openDropped", () => {
  it("opens every dropped folder, in order, and ends idle", async () => {
    const { result } = renderHook(() => useOpenFolder());

    act(() => {
      result.current.openDropped(["/work/a", "/work/b"]);
    });

    await waitFor(() => {
      expect(roots()).toEqual(["/work/a", "/work/b"]);
    });
    expect(result.current.phase).toBe("idle");
    expect(result.current.error).toBeNull();
  });

  it("does nothing for an empty drop", () => {
    const { result } = renderHook(() => useOpenFolder());

    act(() => {
      result.current.openDropped([]);
    });

    expect(result.current.phase).toBe("idle");
    expect(openRepository).not.toHaveBeenCalled();
  });

  it("stops at the tab limit instead of trying the rest", async () => {
    useWorkspace.setState({ limits: { ...TEST_LIMITS, max_tabs: 1 } });
    const { result } = renderHook(() => useOpenFolder());

    act(() => {
      result.current.openDropped(["/work/a", "/work/b", "/work/c"]);
    });

    await waitFor(() => {
      expect(result.current.phase).toBe("idle");
    });
    expect(roots()).toEqual(["/work/a"]);
    expect(openRepository).toHaveBeenCalledTimes(2);
    expect(useWorkspace.getState().notice).toMatchObject({ code: "tabLimit" });
  });

  it("stops at the first folder the backend refuses and reports it", async () => {
    openRepository.mockImplementation((path: string) =>
      path === "/work/bad"
        ? Promise.reject(new Error("not a repository"))
        : Promise.resolve({ path, name: "ok" }),
    );
    const { result } = renderHook(() => useOpenFolder());

    act(() => {
      result.current.openDropped(["/work/a", "/work/bad", "/work/c"]);
    });

    await waitFor(() => {
      expect(result.current.error).not.toBeNull();
    });
    expect(roots()).toEqual(["/work/a"]);
    act(() => {
      result.current.dismissError();
    });
    expect(result.current.error).toBeNull();
  });

  it("is ignored while the folder panel is up", async () => {
    open.mockReturnValue(new Promise(() => undefined));
    const { result } = renderHook(() => useOpenFolder());
    act(() => {
      result.current.choose();
    });
    await waitFor(() => {
      expect(result.current.phase).toBe("choosing");
    });

    act(() => {
      result.current.openDropped(["/work/a"]);
    });

    expect(openRepository).not.toHaveBeenCalled();
    expect(roots()).toEqual([]);
  });

  it("opens dropped folders as projects even when the picker does something else", async () => {
    openTestProject({ path: "/work/existing", name: "existing" });
    const picked = vi.fn().mockResolvedValue(null);
    const { result } = renderHook(() => useOpenFolder(picked));

    act(() => {
      result.current.openDropped(["/work/a"]);
    });

    await waitFor(() => {
      expect(roots()).toEqual(["/work/existing", "/work/a"]);
    });
    expect(picked).not.toHaveBeenCalled();
  });
});
