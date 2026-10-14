import type { SaveWorkspaceRequest } from "../bindings";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetWorkspace, openTestProject } from "../test/workspace";
import { selectCommit, setSearchQuery } from "./navigation";
import { useWorkspace } from "./workspace";
import { restoreTab, workspaceRecord } from "./workspaceRecords";
import { startWorkspacePersistence } from "./workspacePersistence";

const saveWorkspace = vi.hoisted(() =>
  vi.fn<(request: SaveWorkspaceRequest) => Promise<void>>(),
);
vi.mock("../lib/ipc", () => ({ saveWorkspace }));

let stop: (() => void) | undefined;
beforeEach(() => {
  resetWorkspace();
  saveWorkspace.mockReset().mockResolvedValue(undefined);
  vi.useFakeTimers();
});
afterEach(() => {
  stop?.();
  vi.useRealTimers();
});

function start() {
  const writer = startWorkspacePersistence();
  stop = writer.stop;
  return writer;
}

describe("durable workspace", () => {
  it("round trips selections without restoring pending operations or caches", () => {
    openTestProject();
    const id = "a".repeat(40);
    useWorkspace.getState().navigate("/tmp/repo", selectCommit(id));
    const record = workspaceRecord(useWorkspace.getState());
    const tab = record.tabs[0];
    if (tab === undefined) throw new Error("Missing saved tab");
    expect(restoreTab(tab)).toMatchObject({
      repository: { path: "/tmp/repo", name: "repo" },
      verification: { status: "unverified" },
      gitActions: { running: null },
      navigation: { selection: { kind: "commit", commitId: id } },
    });
    expect(record).not.toHaveProperty("gitActions");
    useWorkspace.getState().restore(record);
    expect(workspaceRecord(useWorkspace.getState())).toEqual(record);
  });

  it("writes structural changes immediately and debounces only durable navigation", async () => {
    const writer = start();
    openTestProject();
    await writer.flush();
    expect(saveWorkspace).toHaveBeenCalledTimes(1);
    const store = useWorkspace.getState();
    store.navigate("/tmp/repo", setSearchQuery("temporary"));
    await vi.advanceTimersByTimeAsync(1000);
    expect(saveWorkspace).toHaveBeenCalledTimes(1);
    for (const digit of ["a", "b", "c"]) {
      store.navigate("/tmp/repo", selectCommit(digit.repeat(40)));
    }
    await vi.advanceTimersByTimeAsync(299);
    expect(saveWorkspace).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(saveWorkspace).toHaveBeenCalledTimes(2);
    expect(
      saveWorkspace.mock.calls[1]?.[0].workspace.tabs[0]?.selection,
    ).toMatchObject({ kind: "commit", commit_id: "c".repeat(40) });
  });

  it("flush drains changes received during a write with one request in flight", async () => {
    let finish: (() => void) | undefined;
    saveWorkspace.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const writer = start();
    openTestProject();
    const flushing = writer.flush();
    openTestProject({ path: "/tmp/other", name: "other" });
    expect(saveWorkspace).toHaveBeenCalledTimes(1);
    finish?.();
    await flushing;
    expect(saveWorkspace).toHaveBeenCalledTimes(2);
    expect(saveWorkspace.mock.calls[1]?.[0].workspace.active).toBe(
      "/tmp/other",
    );
    expect(saveWorkspace.mock.calls[1]?.[0].revision).toBeGreaterThan(
      saveWorkspace.mock.calls[0]?.[0].revision ?? 0,
    );
  });

  it("keeps a failed snapshot dirty without retrying until explicitly flushed", async () => {
    const failure = new Error("disk full");
    saveWorkspace.mockRejectedValueOnce(failure);
    const writer = start();
    openTestProject();
    await expect(writer.flush()).rejects.toBe(failure);
    await vi.advanceTimersByTimeAsync(1000);
    expect(saveWorkspace).toHaveBeenCalledTimes(1);
    expect(useWorkspace.getState().storageError?.cause).toBe(failure);
    await writer.flush();
    expect(saveWorkspace).toHaveBeenCalledTimes(2);
    expect(useWorkspace.getState().storageError).toBeNull();
  });

  it("flush saves pending navigation without waiting for its debounce", async () => {
    openTestProject();
    const writer = start();
    useWorkspace.getState().navigate("/tmp/repo", selectCommit("d".repeat(40)));
    expect(saveWorkspace).not.toHaveBeenCalled();
    await writer.flush();
    expect(saveWorkspace).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(saveWorkspace).toHaveBeenCalledTimes(1);
  });
});
