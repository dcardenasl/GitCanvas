// @vitest-environment jsdom
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReleaseListIpc, ReleaseAssetListIpc } from "../../bindings";
import { renderWithQueryClient } from "../../test/test-utils";

const mocks = vi.hoisted(() => ({
  releases: null as ReleaseListIpc | null,
  assets: null as ReleaseAssetListIpc | null,
  download: vi.fn(),
  openExternalUrl: vi.fn(),
  closeRelease: vi.fn(),
}));
vi.mock("../../lib/ipc", () => ({
  openExternalUrl: mocks.openExternalUrl,
}));
vi.mock("../../state/workspace", () => ({
  useNavigationActions: () => ({ closeRelease: mocks.closeRelease }),
}));
vi.mock("../../state/releases", () => ({
  useReleases: () => ({
    data: mocks.releases,
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
  useReleaseAssets: () => ({
    data: mocks.assets,
    isLoading: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
  usePendingReleaseAction: () => null,
  useReleaseDownloadProgress: vi.fn(),
  useFetchReleaseTag: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
    error: null,
    reset: vi.fn(),
  }),
  useDownloadReleaseAsset: () => ({
    mutateAsync: mocks.download,
    isPending: false,
    error: null,
  }),
  useCancelReleaseTransfer: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useReleaseTransfers: () => [],
  discardPendingReleaseAction: vi.fn(),
  releaseQueryKey: { releases: (root: string) => ["releases", root] },
}));

const releaseData: ReleaseListIpc = {
  source: { github: { owner: "example", name: "project" } },
  entries: [
    {
      kind: "release",
      release: {
        id: "release-id-exact",
        tag_name: "v1.0.0",
        name: "Stable release",
        notes:
          '## Highlights\n\n[Pull request](https://github.com/example/project/pull/1)\n\nhttps://docs.example.test/guide\n\n[Full Changelog](../compare/v0.8.0...v1.0.0)\n\n[Unsafe](javascript:alert(1)) and [HTTP](http://example.test)\n\n<img src="https://remote.invalid/pixel.png">\n\nRelease notes',
        html_url: "https://github.com/example/project/releases/tag/v1.0.0",
        prerelease: false,
        published_at: "2026-11-22T10:00:00Z",
      },
      local_tag: null,
    },
  ],
  truncated: false,
  local_tags_available: false,
  cached_at: null,
  rate_limit_reset: null,
};
const assets: ReleaseAssetListIpc = {
  source: releaseData.source,
  release_id: "release-id-exact",
  truncated: false,
  assets: [
    { id: "9007199254740993", name: "archive.zip", size: "128", sha256: null },
  ],
};

import { ReleaseDetailView } from "./ReleaseDetailView";

beforeEach(() => {
  cleanup();
  mocks.assets = assets;
  mocks.releases = releaseData;
  mocks.download.mockReset().mockResolvedValue({ kind: "completed" });
  mocks.openExternalUrl.mockReset().mockResolvedValue(undefined);
  mocks.closeRelease.mockReset();
});
afterEach(cleanup);

describe("ReleaseDetailView", () => {
  it("previews Markdown and keeps unsafe destinations and remote images inert", () => {
    renderWithQueryClient(
      <ReleaseDetailView repositoryPath="/repo" releaseId="release-id-exact" />,
    );
    expect(
      screen.getByRole("heading", { name: "Stable release" }),
    ).toBeTruthy();
    expect(screen.getByText("Más reciente")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Highlights" })).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: "Abrir en el navegador: https://github.com/example/project/pull/1",
      }),
    ).toBeTruthy();
    expect(document.querySelector(".release-detail__notes a")).toBeNull();
    expect(
      screen.getByRole("button", {
        name: "Abrir en el navegador: https://github.com/example/project/releases/compare/v0.8.0...v1.0.0",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: "Abrir en el navegador: https://docs.example.test/guide",
      }),
    ).toBeTruthy();
    expect(screen.getByText("javascript:alert(1)")).toBeTruthy();
    expect(screen.getByText("http://example.test")).toBeTruthy();
    expect(
      document.querySelector("img[src='https://remote.invalid/pixel.png']"),
    ).toBeNull();
    expect(document.querySelector(".release-detail__notes img")).toBeNull();
    expect(screen.getByText("archive.zip")).toBeTruthy();
  });

  it("opens Markdown HTTPS links only after an explicit button activation", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(
      <ReleaseDetailView repositoryPath="/repo" releaseId="release-id-exact" />,
    );
    expect(mocks.openExternalUrl).not.toHaveBeenCalled();
    const link = screen.getByRole("button", {
      name: "Abrir en el navegador: https://github.com/example/project/pull/1",
    });
    link.focus();
    await user.keyboard("{Enter}");
    expect(mocks.openExternalUrl).toHaveBeenCalledWith(
      "https://github.com/example/project/pull/1",
    );
  });

  it("shows a recoverable accessible error when the system browser cannot open a link", async () => {
    const user = userEvent.setup();
    mocks.openExternalUrl
      .mockRejectedValueOnce(new Error("browser unavailable"))
      .mockResolvedValueOnce(undefined);
    renderWithQueryClient(
      <ReleaseDetailView repositoryPath="/repo" releaseId="release-id-exact" />,
    );
    const link = screen.getByRole("button", {
      name: "Abrir en el navegador: https://github.com/example/project/pull/1",
    });
    await user.click(link);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(
      screen.getByText(/No se pudo abrir este enlace en el navegador/),
    ).toBeTruthy();
    await waitFor(() => {
      expect(
        screen
          .getByRole("button", {
            name: "Abrir en el navegador: https://github.com/example/project/pull/1",
          })
          .matches(":disabled"),
      ).toBe(false);
    });
    await user.click(
      screen.getByRole("button", {
        name: "Abrir en el navegador: https://github.com/example/project/pull/1",
      }),
    );
    await waitFor(() => {
      expect(screen.queryByRole("alert")).toBeNull();
    });
    expect(mocks.openExternalUrl).toHaveBeenCalledTimes(2);
  });

  it("downloads with exact release and asset identifiers after explicit selection", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("crypto", { randomUUID: () => "transfer-exact" });
    renderWithQueryClient(
      <ReleaseDetailView repositoryPath="/repo" releaseId="release-id-exact" />,
    );
    await user.click(screen.getByRole("button", { name: "Descargar" }));
    expect(mocks.download).toHaveBeenCalledWith({
      releaseId: "release-id-exact",
      assetId: "9007199254740993",
      transferId: "transfer-exact",
    });
  });

  it("closes the release detail and restores the release row", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(
      <ReleaseDetailView repositoryPath="/repo" releaseId="release-id-exact" />,
    );
    await user.click(screen.getByRole("button", { name: "Cerrar detalle" }));
    expect(mocks.closeRelease).toHaveBeenCalledOnce();
  });
});
