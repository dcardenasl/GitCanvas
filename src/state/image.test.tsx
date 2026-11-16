// @vitest-environment jsdom
import type { QueryClient } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ImageOutcome } from "../bindings";
import {
  createIpcMocks,
  createQueryClientWrapper,
  createTestQueryClient,
} from "../test/test-utils";

const mockIpc = createIpcMocks([
  "getCommitImage",
  "getWorktreeImage",
  "getStashImage",
] as const);
const { getCommitImage } = mockIpc;
vi.mock("../lib/ipc", () => mockIpc);

const { shouldProbeImage, useCommitImage } = await import("./image");

const IMAGE: ImageOutcome = {
  kind: "image",
  image: {
    format: "png",
    width: 12,
    height: 9,
    bytes: "42",
    animated: false,
    data: "AA==",
  },
};

let client: QueryClient;
let wrapper: ReturnType<typeof createQueryClientWrapper>;

beforeEach(() => {
  vi.clearAllMocks();
  client = createTestQueryClient();
  wrapper = createQueryClientWrapper(client);
  getCommitImage.mockResolvedValue(IMAGE);
});

describe("image state", () => {
  it("probes binary files and supported extensions case-insensitively", () => {
    expect(shouldProbeImage({ path: "asset.bin", omitted: "Binary" })).toBe(
      true,
    );
    for (const path of ["logo.PNG", "photo.jpeg", "anim.gif", "vector.svg"]) {
      expect(shouldProbeImage({ path, omitted: null })).toBe(true);
    }
    expect(shouldProbeImage({ path: "notes.png.txt", omitted: null })).toBe(
      false,
    );
    expect(shouldProbeImage({ path: "readme.md", omitted: null })).toBe(false);
  });

  it("reads immutable commit images once and retains them only briefly", async () => {
    const request = {
      commit_id: "a".repeat(40),
      path: "logo.png",
      previous_path: null,
      version: "saved" as const,
    };
    const { result } = renderHook(() => useCommitImage("/repo", request), {
      wrapper,
    });
    await waitFor(() => {
      expect(result.current.data).toEqual(IMAGE);
    });
    expect(getCommitImage).toHaveBeenCalledWith("/repo", {
      ...request,
      expand: false,
    });
    const cached = client.getQueryCache().getAll()[0];
    expect(cached?.queryKey[1]).toBe("/repo");
    expect(cached?.options.gcTime).toBe(15_000);
    client.clear();
  });

  it("does not call IPC without a repository and selected request", () => {
    renderHook(() => useCommitImage(null, null), { wrapper });
    expect(getCommitImage).not.toHaveBeenCalled();
    client.clear();
  });
});
