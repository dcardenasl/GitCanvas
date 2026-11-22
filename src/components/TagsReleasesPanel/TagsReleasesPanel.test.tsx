// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReleaseAssetListIpc, ReleaseListIpc } from "../../bindings";
import type {
  PendingReleaseAction,
  ReleaseTransferState,
} from "../../state/releases";
import { renderWithQueryClient } from "../../test/test-utils";

const mocks = vi.hoisted(() => ({
  repositoryPath: "/repo",
  releases: null as ReleaseListIpc | null,
  isLoading: false,
  error: null as Error | null,
  assets: null as ReleaseAssetListIpc | null,
  assetsError: null as Error | null,
  pendingAction: null as PendingReleaseAction | null,
  transfers: [] as ReleaseTransferState[],
  fetchTag: vi.fn(),
  fetchTagError: null as Error | null,
  downloadAsset: vi.fn(),
  cancelTransfer: vi.fn(),
  storeToken: vi.fn(),
  resumePending: vi.fn(),
  refetchReleases: vi.fn(),
}));

vi.mock("../../state/workspace", () => ({
  useActiveRepository: () => ({ path: mocks.repositoryPath, name: "repo" }),
}));

vi.mock("../../state/releases", () => ({
  useReleases: () => ({
    data: mocks.releases,
    isLoading: mocks.isLoading,
    isFetching: false,
    isError: mocks.error !== null,
    error: mocks.error,
    refetch: mocks.refetchReleases,
  }),
  useReleaseAssets: () => ({
    data: mocks.assets,
    isLoading: false,
    isFetching: false,
    isError: mocks.assetsError !== null,
    error: mocks.assetsError,
    refetch: vi.fn(),
  }),
  usePendingReleaseAction: () => mocks.pendingAction,
  getPendingReleaseAction: () => mocks.pendingAction,
  useReleaseDownloadProgress: vi.fn(),
  useFetchReleaseTag: () => ({
    mutateAsync: mocks.fetchTag,
    isPending: false,
    error: mocks.fetchTagError,
    reset: () => {
      mocks.fetchTagError = null;
    },
  }),
  useDownloadReleaseAsset: () => ({
    mutateAsync: mocks.downloadAsset,
    isPending: false,
    error: null,
  }),
  useCancelReleaseTransfer: () => ({ mutateAsync: mocks.cancelTransfer }),
  useReleaseTransfers: () => mocks.transfers,
  resumePendingReleaseAction: mocks.resumePending,
  releaseQueryKey: {
    releases: (root: string | null) => ["releases", root],
  },
}));

vi.mock("../../lib/ipc", () => ({ storeGithubToken: mocks.storeToken }));

import { TagsReleasesPanel } from "./TagsReleasesPanel";

const releaseList: ReleaseListIpc = {
  source: { github: { owner: "example", name: "project" } },
  entries: [
    {
      kind: "release",
      release: {
        id: "1",
        tag_name: "v2.0",
        name: "Version 2",
        notes: "Release notes",
        html_url: "https://github.com/example/project/releases/tag/v2.0",
        prerelease: false,
        published_at: null,
      },
      local_tag: {
        name: "v2.0",
        target: "a".repeat(40),
        commit_id: "a".repeat(40),
        is_annotated: false,
        commit_time: null,
      },
    },
    {
      kind: "release",
      release: {
        id: "2",
        tag_name: "v1.0",
        name: null,
        notes:
          '<img src="https://remote.invalid/pixel.png"><a href="https://remote.invalid">link</a>',
        html_url: "https://github.com/example/project/releases/tag/v1.0",
        prerelease: true,
        published_at: null,
      },
      local_tag: null,
    },
    {
      kind: "local_tag",
      tag: {
        name: "local-only",
        target: "b".repeat(40),
        commit_id: "b".repeat(40),
        is_annotated: true,
        commit_time: null,
      },
    },
  ],
  truncated: false,
  local_tags_available: true,
  cached_at: null,
  rate_limit_reset: null,
};

const assetList: ReleaseAssetListIpc = {
  source: releaseList.source,
  release_id: "2",
  assets: [
    {
      id: "9007199254740993",
      name: "archive.zip",
      size: "128",
      sha256: null,
    },
  ],
  truncated: false,
};

beforeEach(() => {
  cleanup();
  mocks.repositoryPath = "/repo";
  mocks.releases = releaseList;
  mocks.isLoading = false;
  mocks.error = null;
  mocks.assets = null;
  mocks.assetsError = null;
  mocks.pendingAction = null;
  mocks.transfers = [];
  mocks.fetchTag.mockReset().mockResolvedValue({ kind: "Fetched" });
  mocks.fetchTagError = null;
  mocks.downloadAsset.mockReset().mockResolvedValue({ kind: "completed" });
  mocks.cancelTransfer.mockReset().mockResolvedValue(true);
  mocks.storeToken.mockReset().mockResolvedValue(null);
  mocks.resumePending.mockReset().mockResolvedValue(true);
  mocks.refetchReleases.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("TagsReleasesPanel", () => {
  it("shows backend-joined releases and unmatched local tags in one list", () => {
    renderWithQueryClient(<TagsReleasesPanel />);

    const list = screen.getByRole("list", { name: "Etiquetas y releases" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    const [localRelease, remoteRelease, localTag] = rows;
    if (
      localRelease === undefined ||
      remoteRelease === undefined ||
      localTag === undefined
    )
      throw new Error("Expected the unified release list to have three rows");

    expect(within(localRelease).getByText("Version 2")).toBeTruthy();
    expect(
      within(localRelease).getByText("Disponible en el repositorio local"),
    ).toBeTruthy();
    expect(
      within(remoteRelease).getByRole("heading", { name: "v1.0" }),
    ).toBeTruthy();
    expect(
      within(remoteRelease).getByText("Disponible para traer"),
    ).toBeTruthy();
    expect(within(remoteRelease).getByText("Versión preliminar")).toBeTruthy();
    expect(within(localTag).getByText("local-only")).toBeTruthy();
    expect(within(localTag).getByText("Etiqueta local")).toBeTruthy();
  });

  it("renders release notes as inert text, never as HTML or active links", () => {
    renderWithQueryClient(<TagsReleasesPanel />);

    const note = screen.getByText(
      '<img src="https://remote.invalid/pixel.png"><a href="https://remote.invalid">link</a>',
    );
    expect(note.tagName).toBe("P");
    expect(note.querySelector("img, a")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
    expect(
      document.querySelector('img[src="https://remote.invalid/pixel.png"]'),
    ).toBeNull();
  });

  it("announces when local tags could not be read", () => {
    mocks.releases = { ...releaseList, local_tags_available: false };
    renderWithQueryClient(<TagsReleasesPanel />);

    expect(
      screen.getByText(
        "No se pudieron leer las etiquetas locales; se muestran los releases.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Version 2")).toBeTruthy();
    expect(screen.getAllByText("Estado local no disponible")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Traer v1.0" })).toBeNull();
  });

  it("labels cached release data with its capture time", () => {
    mocks.releases = { ...releaseList, cached_at: "2026-11-22T10:00:00Z" };
    renderWithQueryClient(<TagsReleasesPanel />);

    const formatted = new Intl.DateTimeFormat("es", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date("2026-11-22T10:00:00Z"));
    expect(screen.getByRole("status").textContent).toContain(
      `Se muestran datos guardados de releases del ${formatted}`,
    );
  });

  it("shows a loading status and handles an empty unified list", () => {
    mocks.isLoading = true;
    mocks.releases = null;
    const { rerender } = renderWithQueryClient(<TagsReleasesPanel />);
    expect(screen.getByRole("status").textContent).toBe("Cargando releases…");

    mocks.isLoading = false;
    mocks.releases = { ...releaseList, entries: [] };
    rerender(<TagsReleasesPanel />);
    expect(screen.getByRole("status").textContent).toBe(
      "No se encontraron etiquetas ni releases.",
    );
  });

  it("fetches a selected release tag through the typed mutation", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<TagsReleasesPanel />);

    await user.click(screen.getByRole("button", { name: "Traer v1.0" }));

    expect(mocks.fetchTag).toHaveBeenCalledWith({ tagName: "v1.0" });
  });

  it("saves a token and resumes the pending tag action in the same repository", async () => {
    const user = userEvent.setup();
    mocks.pendingAction = {
      kind: "fetchTag",
      repositoryPath: "/repo",
      tagName: "v1.0",
    };
    mocks.fetchTagError = Object.assign(new Error("access required"), {
      kind: "AccessRequired",
    });
    mocks.resumePending.mockImplementation(() => {
      mocks.pendingAction = null;
      return Promise.resolve(true);
    });
    renderWithQueryClient(<TagsReleasesPanel />);

    await user.type(
      screen.getByLabelText("Token de acceso personal"),
      "ghp_test_token",
    );
    await user.click(screen.getByRole("button", { name: "Guardar token" }));

    await waitFor(() => {
      expect(mocks.storeToken).toHaveBeenCalledWith("ghp_test_token");
      expect(mocks.resumePending).toHaveBeenCalledWith(
        "/repo",
        expect.any(Object),
      );
    });
  });

  it("does not replay an access failure after its pending context is gone", async () => {
    const user = userEvent.setup();
    mocks.error = Object.assign(new Error("access required"), {
      kind: "AccessRequired",
    });
    renderWithQueryClient(<TagsReleasesPanel />);

    await user.type(
      screen.getByLabelText("Token de acceso personal"),
      "ghp_test_token",
    );
    await user.click(screen.getByRole("button", { name: "Guardar token" }));

    await waitFor(() => {
      expect(mocks.storeToken).toHaveBeenCalledWith("ghp_test_token");
      expect(mocks.resumePending).not.toHaveBeenCalled();
      expect(
        screen.getByText(
          "Acceso guardado. Reintenta la acción anterior de forma explícita.",
        ),
      ).toBeTruthy();
    });
    await user.click(
      screen.getByRole("button", { name: "Reintentar lista de releases" }),
    );
    expect(mocks.refetchReleases).toHaveBeenCalledOnce();
  });

  it("uses exact asset IDs and only retries a download after a new user click", async () => {
    const user = userEvent.setup();
    mocks.assets = assetList;
    mocks.downloadAsset
      .mockRejectedValueOnce(
        Object.assign(new Error("access required"), {
          kind: "AccessRequired",
        }),
      )
      .mockResolvedValueOnce({ kind: "completed" });
    vi.stubGlobal("crypto", { randomUUID: () => "transfer-1" });
    renderWithQueryClient(<TagsReleasesPanel />);

    await user.click(
      screen.getByRole("button", { name: "Ver adjuntos de v1.0" }),
    );
    await user.click(await screen.findByRole("button", { name: "Descargar" }));
    await user.type(
      await screen.findByLabelText("Token de acceso personal"),
      "ghp_test_token",
    );
    await user.click(screen.getByRole("button", { name: "Guardar token" }));

    await waitFor(() => {
      expect(mocks.downloadAsset).toHaveBeenCalledTimes(1);
      expect(mocks.resumePending).not.toHaveBeenCalled();
      expect(mocks.storeToken).toHaveBeenCalledWith("ghp_test_token");
      expect(screen.getByRole("status").textContent).toContain(
        "Acceso restablecido",
      );
    });
    await user.click(screen.getByRole("button", { name: "Descargar" }));
    await waitFor(() => {
      expect(mocks.downloadAsset).toHaveBeenCalledTimes(2);
    });
    expect(mocks.downloadAsset).toHaveBeenLastCalledWith({
      releaseId: "2",
      assetId: "9007199254740993",
      transferId: "transfer-1",
    });
  });

  it("announces transfer progress and sends cancellation for its transfer ID", async () => {
    const user = userEvent.setup();
    mocks.assets = assetList;
    mocks.transfers = [
      {
        transferId: "transfer-active",
        repositoryPath: "/repo",
        releaseId: "2",
        assetId: "9007199254740993",
        status: "downloading",
        downloadedBytes: "50",
        totalBytes: "100",
        errorKind: null,
      },
    ];
    renderWithQueryClient(<TagsReleasesPanel />);

    await user.click(
      screen.getByRole("button", { name: "Ver adjuntos de v1.0" }),
    );

    expect(screen.getByRole("progressbar")).toBeTruthy();
    expect(screen.getByText(/Descargando · 50 de 100 bytes/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Cancelar descarga" }));
    expect(mocks.cancelTransfer).toHaveBeenCalledWith({
      transferId: "transfer-active",
    });
  });

  it("presents typed offline errors instead of inventing a release list", () => {
    mocks.releases = null;
    mocks.isLoading = false;
    mocks.error = Object.assign(new Error("offline"), { kind: "Offline" });
    renderWithQueryClient(<TagsReleasesPanel />);

    expect(screen.getByText("El dispositivo está sin conexión")).toBeTruthy();
    expect(
      screen.queryByRole("list", { name: "Etiquetas y releases" }),
    ).toBeNull();
  });
});
