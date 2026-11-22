// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AppError,
  DownloadOutcomeIpc,
  FetchTagOutcome,
  ReleaseAssetListIpc,
  ReleaseDownloadProgressEvent,
  ReleaseListIpc,
} from "../bindings";
import {
  createTestQueryClient,
  createQueryClientWrapper,
} from "../test/test-utils";
import {
  discardPendingReleaseAction,
  getPendingReleaseAction,
  resumePendingReleaseAction,
  useDownloadReleaseAsset,
  useCancelReleaseTransfer,
  useCachedReleases,
  useFetchReleaseTag,
  usePendingReleaseAction,
  useReleaseAssets,
  useReleaseDownloadProgress,
  useReleaseTransfers,
  useReleases,
} from "./releases";

type IpcResult<T> =
  | { readonly status: "ok"; readonly data: T }
  | { readonly status: "error"; readonly error: AppError };

const mocks = vi.hoisted(() => ({
  getReleases: vi.fn<(path: string) => Promise<IpcResult<ReleaseListIpc>>>(),
  getCachedReleases:
    vi.fn<(path: string) => Promise<IpcResult<ReleaseListIpc | null>>>(),
  getReleaseAssets:
    vi.fn<
      (
        path: string,
        releaseId: string,
      ) => Promise<IpcResult<ReleaseAssetListIpc>>
    >(),
  fetchTag:
    vi.fn<
      (path: string, tagName: string) => Promise<IpcResult<FetchTagOutcome>>
    >(),
  downloadReleaseAsset:
    vi.fn<
      (
        path: string,
        releaseId: string,
        assetId: string,
        transferId: string,
      ) => Promise<IpcResult<DownloadOutcomeIpc>>
    >(),
  cancelTransfer:
    vi.fn<(path: string, transferId: string) => Promise<IpcResult<boolean>>>(),
  listen:
    vi.fn<
      (
        handler: (event: {
          readonly payload: ReleaseDownloadProgressEvent;
        }) => void,
      ) => Promise<() => void>
    >(),
}));

vi.mock("../bindings", () => ({
  commands: mocks,
  events: { releaseDownloadProgressEvent: { listen: mocks.listen } },
}));

vi.mock("@tauri-apps/api/core", () => ({ isTauri: () => true }));

function ok<T>(data: T): IpcResult<T> {
  return { status: "ok", data };
}

function accessRequired(): IpcResult<never> {
  return { status: "error", error: { kind: "AccessRequired" } };
}

const RELEASES: ReleaseListIpc = {
  source: { github: { owner: "example", name: "repo" } },
  entries: [],
  truncated: false,
  local_tags_available: true,
  cached_at: null,
  rate_limit_reset: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  discardPendingReleaseAction();
});

describe("release queries", () => {
  it("queries fresh releases under the repository-specific key", async () => {
    mocks.getReleases.mockResolvedValueOnce(ok(RELEASES));
    const client = createTestQueryClient();
    const { result } = renderHook(() => useReleases("/repo/a"), {
      wrapper: createQueryClientWrapper(client),
    });
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(mocks.getReleases).toHaveBeenCalledWith("/repo/a");
    expect(client.getQueryData(["releases", "/repo/a"])).toEqual(RELEASES);
  });

  it("queries assets with the exact decimal release ID", async () => {
    mocks.getReleaseAssets.mockResolvedValueOnce(
      ok({
        source: RELEASES.source,
        release_id: "9007199254740993",
        assets: [],
        truncated: false,
      }),
    );
    const { result } = renderHook(
      () => useReleaseAssets("/repo/a", "9007199254740993"),
      { wrapper: createQueryClientWrapper() },
    );
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(mocks.getReleaseAssets).toHaveBeenCalledWith(
      "/repo/a",
      "9007199254740993",
    );
  });

  it("reads cached releases through its separate query key", async () => {
    mocks.getCachedReleases.mockResolvedValueOnce(ok(RELEASES));
    const client = createTestQueryClient();
    const { result } = renderHook(() => useCachedReleases("/repo/a"), {
      wrapper: createQueryClientWrapper(client),
    });
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(mocks.getCachedReleases).toHaveBeenCalledWith("/repo/a");
    expect(client.getQueryData(["cached-releases", "/repo/a"])).toEqual(
      RELEASES,
    );
  });
});

describe("pending access recovery", () => {
  it("retries the same tag action after token save", async () => {
    mocks.fetchTag
      .mockResolvedValueOnce(accessRequired())
      .mockResolvedValueOnce(ok({ kind: "Fetched" }));
    const client = createTestQueryClient();
    const { result } = renderHook(() => useFetchReleaseTag("/repo/a"), {
      wrapper: createQueryClientWrapper(client),
    });
    await act(async () => {
      await expect(
        result.current.mutateAsync({ tagName: "v1.2.3" }),
      ).rejects.toMatchObject({
        kind: "AccessRequired",
      });
    });
    expect(getPendingReleaseAction()).toEqual({
      kind: "fetchTag",
      repositoryPath: "/repo/a",
      tagName: "v1.2.3",
    });
    await expect(resumePendingReleaseAction("/repo/a", client)).resolves.toBe(
      true,
    );
    expect(mocks.fetchTag.mock.calls).toEqual([
      ["/repo/a", "v1.2.3"],
      ["/repo/a", "v1.2.3"],
    ]);
    expect(getPendingReleaseAction()).toBeNull();
  });

  it("discards a pending query after another authentication failure", async () => {
    mocks.getReleases.mockResolvedValueOnce(accessRequired());
    const client = createTestQueryClient();
    const { result } = renderHook(() => useReleases("/repo/a"), {
      wrapper: createQueryClientWrapper(client),
    });
    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(getPendingReleaseAction()).toEqual({
      kind: "getReleases",
      repositoryPath: "/repo/a",
    });
    mocks.getReleases.mockResolvedValueOnce(accessRequired());
    await expect(
      resumePendingReleaseAction("/repo/a", client),
    ).rejects.toMatchObject({
      kind: "AccessRequired",
    });
    expect(getPendingReleaseAction()).toBeNull();
  });

  it("replays asset metadata with its original decimal release ID", async () => {
    const assets: ReleaseAssetListIpc = {
      source: RELEASES.source,
      release_id: "9007199254740993",
      assets: [],
      truncated: false,
    };
    mocks.getReleaseAssets
      .mockResolvedValueOnce(accessRequired())
      .mockResolvedValueOnce(ok(assets));
    const client = createTestQueryClient();
    const { result } = renderHook(
      () => useReleaseAssets("/repo/a", "9007199254740993"),
      { wrapper: createQueryClientWrapper(client) },
    );
    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    await expect(resumePendingReleaseAction("/repo/a", client)).resolves.toBe(
      true,
    );
    expect(mocks.getReleaseAssets.mock.calls).toEqual([
      ["/repo/a", "9007199254740993"],
      ["/repo/a", "9007199254740993"],
    ]);
    expect(
      client.getQueryData(["release-assets", "/repo/a", "9007199254740993"]),
    ).toEqual(assets);
  });

  it("discards pending state when the root changes or the panel closes", async () => {
    mocks.getReleases.mockResolvedValueOnce(accessRequired());
    const { result, rerender } = renderHook(
      ({ root, open }: { root: string | null; open: boolean }) => {
        const pending = usePendingReleaseAction(root, open);
        const releases = useReleases(root);
        return { pending, releases };
      },
      {
        initialProps: { root: "/repo/a", open: true },
        wrapper: createQueryClientWrapper(),
      },
    );
    await waitFor(() => {
      expect(result.current.releases.isError).toBe(true);
    });
    expect(result.current.pending?.repositoryPath).toBe("/repo/a");
    mocks.getReleases.mockResolvedValueOnce(accessRequired());
    rerender({ root: "/repo/b", open: true });
    await waitFor(() => {
      expect(getPendingReleaseAction()).toBeNull();
    });

    await waitFor(() => {
      expect(getPendingReleaseAction()?.repositoryPath).toBe("/repo/b");
    });
    rerender({ root: "/repo/b", open: false });
    await waitFor(() => {
      expect(getPendingReleaseAction()).toBeNull();
    });
  });

  it("never queues or replays a download without a chosen destination", async () => {
    mocks.downloadReleaseAsset.mockResolvedValueOnce(accessRequired());
    const client = createTestQueryClient();
    const { result } = renderHook(() => useDownloadReleaseAsset("/repo/a"), {
      wrapper: createQueryClientWrapper(client),
    });
    await act(async () => {
      await expect(
        result.current.mutateAsync({
          releaseId: "18",
          assetId: "19",
          transferId: "transfer-1",
        }),
      ).rejects.toMatchObject({ kind: "AccessRequired" });
    });
    expect(getPendingReleaseAction()).toBeNull();
    await expect(resumePendingReleaseAction("/repo/a", client)).resolves.toBe(
      false,
    );
    expect(mocks.downloadReleaseAsset).toHaveBeenCalledTimes(1);
  });

  it("requests cancellation only for the supplied transfer ID", async () => {
    mocks.cancelTransfer.mockResolvedValueOnce(ok(true));
    const { result } = renderHook(() => useCancelReleaseTransfer("/repo/a"), {
      wrapper: createQueryClientWrapper(),
    });
    await act(async () => {
      await result.current.mutateAsync({ transferId: "transfer-1" });
    });
    expect(mocks.cancelTransfer).toHaveBeenCalledWith("/repo/a", "transfer-1");
  });
});

describe("download transfer state", () => {
  it("applies progress only to the matching repository and transfer", async () => {
    let finishDownload!: (result: IpcResult<DownloadOutcomeIpc>) => void;
    mocks.downloadReleaseAsset.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishDownload = resolve;
        }),
    );
    let publish: (event: {
      readonly payload: ReleaseDownloadProgressEvent;
    }) => void = () => undefined;
    const unlisten = vi.fn();
    mocks.listen.mockImplementation((handler) => {
      publish = handler;
      return Promise.resolve(unlisten);
    });
    const client = createTestQueryClient();
    const wrapper = createQueryClientWrapper(client);
    const { result } = renderHook(
      () => {
        useReleaseDownloadProgress("/repo/a");
        return {
          download: useDownloadReleaseAsset("/repo/a"),
          transfers: useReleaseTransfers("/repo/a"),
        };
      },
      { wrapper },
    );
    await waitFor(() => {
      expect(mocks.listen).toHaveBeenCalledTimes(1);
    });
    const download = result.current.download.mutateAsync({
      releaseId: "18",
      assetId: "19",
      transferId: "transfer-1",
    });
    await waitFor(() => {
      expect(result.current.transfers[0]?.status).toBe("starting");
    });
    act(() => {
      publish({
        payload: {
          transfer_id: "transfer-1",
          downloaded_bytes: "100",
          total_bytes: "200",
        },
      });
    });
    expect(result.current.transfers[0]?.downloadedBytes).toBe("100");
    expect(result.current.transfers[0]?.totalBytes).toBe("200");
    expect(result.current.transfers[0]?.status).toBe("downloading");
    await act(async () => {
      finishDownload(ok({ kind: "completed", downloaded_bytes: "200" }));
      await download;
    });
    expect(result.current.transfers[0]?.status).toBe("completed");
    act(() => {
      publish({
        payload: {
          transfer_id: "transfer-1",
          downloaded_bytes: "200",
          total_bytes: "200",
        },
      });
    });
    expect(result.current.transfers[0]?.status).toBe("completed");
    expect(unlisten).not.toHaveBeenCalled();
  });
});
