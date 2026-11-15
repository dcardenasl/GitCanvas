import { useQuery } from "@tanstack/react-query";

import type {
  CommitImageRequest,
  ImageOutcome,
  StashImage,
  StashImageRequest,
  WorktreeImage,
  WorktreeImageRequest,
} from "../bindings";
import { getCommitImage, getStashImage, getWorktreeImage } from "../lib/ipc";
import { queryKeys } from "./queryKeys";

const IMAGE_GC_TIME = 15_000;
const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".bmp",
  ".ico",
  ".svg",
]);

/** Whether a file summary merits an explicit, bounded image probe. */
export function shouldProbeImage(file: {
  readonly path: string;
  readonly omitted: string | null;
}): boolean {
  if (file.omitted === "Binary") return true;
  const separator = file.path.lastIndexOf("/");
  const name = file.path.slice(separator + 1).toLowerCase();
  const dot = name.lastIndexOf(".");
  return dot >= 0 && IMAGE_EXTENSIONS.has(name.slice(dot));
}

/** Reads one immutable commit image version. */
export function useCommitImage(
  root: string | null,
  request: Omit<CommitImageRequest, "expand"> | null,
  expand = false,
) {
  const key = queryKeys.image(
    root,
    `commit:${request?.commit_id ?? ""}:${request?.previous_path ?? ""}`,
    request?.path ?? "",
    request?.version ?? "saved",
    expand,
  );
  return useQuery<ImageOutcome>({
    queryKey: key,
    enabled: root !== null && request !== null,
    queryFn: () => {
      if (root === null || request === null)
        throw new Error("No commit image is selected");
      return getCommitImage(root, { ...request, expand });
    },
    staleTime: Infinity,
    gcTime: IMAGE_GC_TIME,
    refetchOnWindowFocus: false,
    structuralSharing: false,
    retry: false,
  });
}

/** Reads one worktree image version tied to the selected snapshot revision. */
export function useWorktreeImage(
  root: string | null,
  request: Omit<WorktreeImageRequest, "expand"> | null,
  expand = false,
) {
  const key = queryKeys.image(
    root,
    `worktree:${request?.side ?? ""}:${request?.previous_path ?? ""}`,
    request?.path ?? "",
    request?.version ?? "saved",
    expand,
    request?.expected_revision,
  );
  return useQuery<WorktreeImage>({
    queryKey: key,
    enabled: root !== null && request !== null,
    queryFn: () => {
      if (root === null || request === null)
        throw new Error("No worktree image is selected");
      return getWorktreeImage(root, { ...request, expand });
    },
    staleTime: 0,
    gcTime: IMAGE_GC_TIME,
    refetchOnWindowFocus: false,
    structuralSharing: false,
    retry: false,
  });
}

/** Reads one immutable image version from the selected stash comparison. */
export function useStashImage(
  root: string | null,
  request: Omit<StashImageRequest, "expand"> | null,
  expand = false,
) {
  const key = queryKeys.image(
    root,
    request === null
      ? "stash:"
      : `stash:${request.file.stash_id}:${request.file.mode}:${request.file.file_key}`,
    request?.file.file_key ?? "",
    request?.version ?? "saved",
    expand,
  );
  return useQuery<StashImage>({
    queryKey: key,
    enabled: root !== null && request !== null,
    queryFn: () => {
      if (root === null || request === null)
        throw new Error("No stash image is selected");
      return getStashImage(root, { ...request, expand });
    },
    staleTime: Infinity,
    gcTime: IMAGE_GC_TIME,
    refetchOnWindowFocus: false,
    structuralSharing: false,
    retry: false,
  });
}
