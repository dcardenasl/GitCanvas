import { useEffect } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { useMutation, useQuery, type QueryClient } from "@tanstack/react-query";
import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";

import { commands, events } from "../bindings";
import type {
  AppError,
  DownloadOutcomeIpc,
  FetchTagOutcome,
  ReleaseDownloadProgressEvent,
} from "../bindings";
import { errorKind, errorMessage } from "../lib/errors";

const releaseKeys = {
  releases: (root: string | null) => ["releases", root] as const,
  cachedReleases: (root: string | null) => ["cached-releases", root] as const,
  assets: (root: string | null, releaseId: string | null) =>
    ["release-assets", root, releaseId] as const,
};

/** An action safe to repeat after the user saves a valid GitHub token. */
export type PendingReleaseAction =
  | { readonly kind: "getReleases"; readonly repositoryPath: string }
  | {
      readonly kind: "getReleaseAssets";
      readonly repositoryPath: string;
      readonly releaseId: string;
    }
  | {
      readonly kind: "fetchTag";
      readonly repositoryPath: string;
      readonly tagName: string;
    };

/** Ephemeral transfer status; it contains no URL, token, or destination path. */
export interface ReleaseTransferState {
  readonly transferId: string;
  readonly repositoryPath: string;
  readonly releaseId: string;
  readonly assetId: string;
  readonly status:
    "starting" | "downloading" | "completed" | "cancelled" | "failed";
  readonly downloadedBytes: string;
  readonly totalBytes: string | null;
  readonly errorKind: AppError["kind"] | null;
}

interface ReleaseState {
  readonly pendingAction: PendingReleaseAction | null;
  readonly transfers: Readonly<Record<string, ReleaseTransferState>>;
  readonly setPendingAction: (action: PendingReleaseAction) => void;
  readonly clearPendingAction: () => void;
  readonly beginTransfer: (transfer: ReleaseTransferState) => void;
  readonly updateTransfer: (
    transferId: string,
    update: Partial<ReleaseTransferState>,
  ) => void;
  readonly applyProgress: (
    repositoryPath: string,
    event: ReleaseDownloadProgressEvent,
  ) => void;
}

const useReleaseState = create<ReleaseState>((set) => ({
  pendingAction: null,
  transfers: {},
  setPendingAction: (pendingAction) => {
    set({ pendingAction });
  },
  clearPendingAction: () => {
    set({ pendingAction: null });
  },
  beginTransfer: (transfer) => {
    set((state) => ({
      transfers: { ...state.transfers, [transfer.transferId]: transfer },
    }));
  },
  updateTransfer: (transferId, update) => {
    set((state) => {
      const existing = state.transfers[transferId];
      if (existing === undefined) return state;
      return {
        transfers: {
          ...state.transfers,
          [transferId]: { ...existing, ...update },
        },
      };
    });
  },
  applyProgress: (repositoryPath, event) => {
    set((state) => {
      const existing = state.transfers[event.transfer_id];
      if (
        existing?.repositoryPath !== repositoryPath ||
        existing.status === "completed" ||
        existing.status === "cancelled" ||
        existing.status === "failed"
      )
        return state;
      return {
        transfers: {
          ...state.transfers,
          [event.transfer_id]: {
            ...existing,
            status: "downloading",
            downloadedBytes: event.downloaded_bytes,
            totalBytes: event.total_bytes,
          },
        },
      };
    });
  },
}));

/** Reads the transient pending request without exposing transfer secrets or destinations. */
export function getPendingReleaseAction(): PendingReleaseAction | null {
  return useReleaseState.getState().pendingAction;
}

/** Drops the one in-memory request, used when a release panel closes. */
export function discardPendingReleaseAction(): void {
  useReleaseState.getState().clearPendingAction();
}

function isAccessRequired(error: unknown): boolean {
  return errorKind(error) === "AccessRequired";
}

async function captureAccessFailure<T>(
  action: PendingReleaseAction,
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isAccessRequired(error))
      useReleaseState.getState().setPendingAction(action);
    throw error;
  }
}

async function releaseQuery<T>(
  response: Promise<
    | { readonly status: "ok"; readonly data: T }
    | { readonly status: "error"; readonly error: AppError }
  >,
): Promise<T> {
  const result = await response;
  if (result.status === "error")
    throw Object.assign(new Error(errorMessage(result.error)), {
      kind: result.error.kind,
    });
  return result.data;
}

/** Queries fresh published releases and captures AccessRequired for safe retry. */
export function useReleases(repositoryPath: string | null) {
  return useQuery({
    queryKey: releaseKeys.releases(repositoryPath),
    enabled: repositoryPath !== null,
    staleTime: 30_000,
    retry: false,
    queryFn: () => {
      if (repositoryPath === null) throw new Error("No repository is open");
      return captureAccessFailure({ kind: "getReleases", repositoryPath }, () =>
        releaseQuery(commands.getReleases(repositoryPath)),
      );
    },
  });
}

/** Reads cached releases without putting release data into persistent workspace state. */
export function useCachedReleases(repositoryPath: string | null) {
  return useQuery({
    queryKey: releaseKeys.cachedReleases(repositoryPath),
    enabled: repositoryPath !== null,
    staleTime: 30_000,
    retry: false,
    queryFn: () => {
      if (repositoryPath === null) throw new Error("No repository is open");
      return releaseQuery(commands.getCachedReleases(repositoryPath));
    },
  });
}

/** Queries fresh asset descriptors; assets are never authorized from notes cache. */
export function useReleaseAssets(
  repositoryPath: string | null,
  releaseId: string | null,
) {
  return useQuery({
    queryKey: releaseKeys.assets(repositoryPath, releaseId),
    enabled: repositoryPath !== null && releaseId !== null,
    staleTime: 0,
    retry: false,
    queryFn: () => {
      if (repositoryPath === null || releaseId === null)
        throw new Error(
          "Release assets were queried without a repository and release",
        );
      return captureAccessFailure(
        { kind: "getReleaseAssets", repositoryPath, releaseId },
        () =>
          releaseQuery(commands.getReleaseAssets(repositoryPath, releaseId)),
      );
    },
  });
}

/** Fetches one selected tag and records the exact request on an access failure. */
export function useFetchReleaseTag(repositoryPath: string | null) {
  return useMutation<FetchTagOutcome, Error, { readonly tagName: string }>({
    mutationFn: ({ tagName }) => {
      if (repositoryPath === null) throw new Error("No repository is open");
      return captureAccessFailure(
        { kind: "fetchTag", repositoryPath, tagName },
        () => releaseQuery(commands.fetchTag(repositoryPath, tagName)),
      );
    },
  });
}

/** Replays one safe pending action after token save and refreshes its query cache. */
export async function resumePendingReleaseAction(
  repositoryPath: string,
  queryClient: QueryClient,
): Promise<boolean> {
  const state = useReleaseState.getState();
  const action = state.pendingAction;
  if (action === null) return false;
  if (action.repositoryPath !== repositoryPath) {
    state.clearPendingAction();
    return false;
  }

  try {
    switch (action.kind) {
      case "getReleases": {
        const data = await releaseQuery(commands.getReleases(repositoryPath));
        queryClient.setQueryData(releaseKeys.releases(repositoryPath), data);
        break;
      }
      case "getReleaseAssets": {
        const data = await releaseQuery(
          commands.getReleaseAssets(repositoryPath, action.releaseId),
        );
        queryClient.setQueryData(
          releaseKeys.assets(repositoryPath, action.releaseId),
          data,
        );
        break;
      }
      case "fetchTag":
        await releaseQuery(commands.fetchTag(repositoryPath, action.tagName));
        break;
    }
  } catch (error) {
    if (isAccessRequired(error)) state.clearPendingAction();
    throw error;
  }
  if (useReleaseState.getState().pendingAction === action)
    useReleaseState.getState().clearPendingAction();
  return true;
}

/** Exposes only the pending action belonging to this root and drops it on close/switch. */
export function usePendingReleaseAction(
  repositoryPath: string | null,
  panelOpen: boolean,
) {
  const pending = useReleaseState((state) => state.pendingAction);
  const clear = useReleaseState((state) => state.clearPendingAction);
  useEffect(() => {
    if (!panelOpen || repositoryPath === null) {
      clear();
      return;
    }
    if (pending !== null && pending.repositoryPath !== repositoryPath) clear();
  }, [clear, panelOpen, pending, repositoryPath]);
  return panelOpen && pending?.repositoryPath === repositoryPath
    ? pending
    : null;
}

/** Runs the pending-action cleanup on repository changes and panel close. */
export function useReleasePendingLifecycle(
  repositoryPath: string | null,
  panelOpen: boolean,
): void {
  usePendingReleaseAction(repositoryPath, panelOpen);
}

/** Subscribes to bounded Rust progress events for the given repository. */
export function useReleaseDownloadProgress(
  repositoryPath: string | null,
): void {
  useEffect(() => {
    if (repositoryPath === null || !isTauri()) return;
    let active = true;
    let stop: (() => void) | undefined;
    void events.releaseDownloadProgressEvent
      .listen((event) => {
        if (active)
          useReleaseState
            .getState()
            .applyProgress(repositoryPath, event.payload);
      })
      .then((unlisten) => {
        if (active) stop = unlisten;
        else unlisten();
      });
    return () => {
      active = false;
      stop?.();
    };
  }, [repositoryPath]);
}

/** Starts a Rust-owned destination dialog and tracks transfer progress in memory. */
export function useDownloadReleaseAsset(repositoryPath: string | null) {
  const begin = useReleaseState((state) => state.beginTransfer);
  const update = useReleaseState((state) => state.updateTransfer);
  return useMutation<
    DownloadOutcomeIpc,
    Error,
    {
      readonly releaseId: string;
      readonly assetId: string;
      readonly transferId: string;
    }
  >({
    mutationFn: async ({ releaseId, assetId, transferId }) => {
      if (repositoryPath === null) throw new Error("No repository is open");
      begin({
        transferId,
        repositoryPath,
        releaseId,
        assetId,
        status: "starting",
        downloadedBytes: "0",
        totalBytes: null,
        errorKind: null,
      });
      try {
        const outcome = await releaseQuery(
          commands.downloadReleaseAsset(
            repositoryPath,
            releaseId,
            assetId,
            transferId,
          ),
        );
        update(transferId, {
          status: outcome.kind === "completed" ? "completed" : "cancelled",
          ...(outcome.kind === "completed"
            ? { downloadedBytes: outcome.downloaded_bytes }
            : {}),
        });
        return outcome;
      } catch (error) {
        update(transferId, { status: "failed", errorKind: errorKind(error) });
        // A download is not stored as a replayable pending action. Its destination
        // belongs to Rust's native dialog and has no safe frontend chosen signal.
        throw error;
      }
    },
  });
}

/** Requests cancellation without attaching a token or other private state. */
export function useCancelReleaseTransfer(repositoryPath: string | null) {
  return useMutation<boolean, Error, { readonly transferId: string }>({
    mutationFn: ({ transferId }) => {
      if (repositoryPath === null) throw new Error("No repository is open");
      return releaseQuery(commands.cancelTransfer(repositoryPath, transferId));
    },
    onSuccess: (cancelled, { transferId }) => {
      if (cancelled)
        useReleaseState
          .getState()
          .updateTransfer(transferId, { status: "cancelled" });
    },
  });
}

/** Reads ephemeral transfers for one repository. */
export function useReleaseTransfers(repositoryPath: string | null) {
  return useReleaseState(
    useShallow((state) =>
      Object.values(state.transfers).filter(
        (transfer) => transfer.repositoryPath === repositoryPath,
      ),
    ),
  );
}

/** Re-exported for focused tests without exposing the store's secret-free internals. */
export const releaseQueryKey = releaseKeys;
