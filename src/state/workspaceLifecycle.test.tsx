// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { resetWorkspace, openTestProject } from "../test/workspace";
import { selectCommit } from "./navigation";
import { useWorkspace } from "./workspace";
import { useWorkspaceLifecycle } from "./workspaceLifecycle";

const mock = vi.hoisted(() => ({
  save: vi.fn(),
  acknowledge: vi.fn(),
  destroy: vi.fn(),
  unlisten: vi.fn(),
  listen:
    vi.fn<
      (
        handler: (event: { preventDefault: () => void }) => Promise<void>,
      ) => Promise<() => void>
    >(),
}));
vi.mock("../lib/ipc", () => ({
  saveWorkspace: mock.save,
  acknowledgeShutdown: mock.acknowledge,
}));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    onCloseRequested: mock.listen,
    destroy: mock.destroy,
  }),
}));

beforeEach(() => {
  resetWorkspace();
  openTestProject();
  vi.clearAllMocks();
  mock.listen.mockResolvedValue(mock.unlisten);
  mock.save.mockResolvedValue(null);
  mock.acknowledge.mockResolvedValue(null);
  mock.destroy.mockResolvedValue(null);
});

it("prevents native close and destroys the window only after the last navigation is saved", async () => {
  let finish: (() => void) | undefined;
  mock.save.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const hook = renderHook(useWorkspaceLifecycle);
  await waitFor(() => {
    expect(mock.listen).toHaveBeenCalledTimes(1);
  });
  act(() => {
    useWorkspace.getState().navigate("/tmp/repo", selectCommit("e".repeat(40)));
  });
  const handler = mock.listen.mock.calls[0]?.[0];
  if (handler === undefined) throw new Error("Missing close handler");
  const preventDefault = vi.fn();
  const closing = handler({ preventDefault });
  expect(preventDefault).toHaveBeenCalledTimes(1);
  expect(mock.destroy).not.toHaveBeenCalled();
  // The save starts only once the close request has been acknowledged.
  await waitFor(() => {
    expect(finish).toBeDefined();
  });
  finish?.();
  await closing;
  expect(mock.destroy).toHaveBeenCalledTimes(1);
  hook.unmount();
  expect(mock.unlisten).toHaveBeenCalledTimes(1);
});

it("keeps the window open after a save failure and lets a second close retry", async () => {
  mock.save.mockRejectedValueOnce(new Error("disk full"));
  const hook = renderHook(useWorkspaceLifecycle);
  await waitFor(() => {
    expect(mock.listen).toHaveBeenCalledTimes(1);
  });
  act(() => {
    useWorkspace.getState().navigate("/tmp/repo", selectCommit("e".repeat(40)));
  });
  const handler = mock.listen.mock.calls[0]?.[0];
  if (handler === undefined) throw new Error("Missing close handler");
  await handler({ preventDefault: vi.fn() });
  expect(mock.destroy).not.toHaveBeenCalled();
  expect(useWorkspace.getState().storageError?.cause).toEqual(
    new Error("disk full"),
  );
  await handler({ preventDefault: vi.fn() });
  expect(mock.destroy).toHaveBeenCalledTimes(1);
  hook.unmount();
});

it("acknowledges the close request before it starts saving", async () => {
  const order: string[] = [];
  mock.acknowledge.mockImplementation(() => {
    order.push("acknowledge");
    return Promise.resolve(null);
  });
  mock.save.mockImplementation(() => {
    order.push("save");
    return Promise.resolve(null);
  });
  const hook = renderHook(useWorkspaceLifecycle);
  await waitFor(() => {
    expect(mock.listen).toHaveBeenCalledTimes(1);
  });
  order.length = 0;
  act(() => {
    useWorkspace.getState().navigate("/tmp/repo", selectCommit("e".repeat(40)));
  });
  const handler = mock.listen.mock.calls[0]?.[0];
  if (handler === undefined) throw new Error("Missing close handler");

  await handler({ preventDefault: vi.fn() });

  expect(order[0]).toBe("acknowledge");
  expect(order).toContain("save");
  hook.unmount();
});

it("stays open, with the failure shown, when the acknowledgement cannot be sent", async () => {
  mock.acknowledge.mockRejectedValueOnce(new Error("no backend"));
  const hook = renderHook(useWorkspaceLifecycle);
  await waitFor(() => {
    expect(mock.listen).toHaveBeenCalledTimes(1);
  });
  const handler = mock.listen.mock.calls[0]?.[0];
  if (handler === undefined) throw new Error("Missing close handler");

  await handler({ preventDefault: vi.fn() });

  expect(mock.destroy).not.toHaveBeenCalled();
  expect(useWorkspace.getState().storageError?.cause).toEqual(
    new Error("no backend"),
  );
  hook.unmount();
});
