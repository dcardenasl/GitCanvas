// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReleaseListIpc } from "../../bindings";
import type { PendingReleaseAction } from "../../state/releases";
import { renderWithQueryClient } from "../../test/test-utils";

const mocks = vi.hoisted(() => ({
  releases: null as ReleaseListIpc | null,
  isLoading: false,
  error: null as Error | null,
  pendingAction: null as PendingReleaseAction | null,
  releaseView: null as { releaseId: string } | null,
  openRelease: vi.fn(),
  refetchReleases: vi.fn(),
}));

vi.mock("../../state/workspace", () => ({
  useActiveRepository: () => ({ path: "/repo", name: "repo" }),
  useNavigation: (select: (navigation: unknown) => unknown) =>
    select({ releaseView: mocks.releaseView }),
  useNavigationActions: () => ({ openRelease: mocks.openRelease }),
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
  usePendingReleaseAction: () => mocks.pendingAction,
}));

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
        notes: "Hidden in list",
        html_url: "https://github.com/example/project/releases/tag/v2.0",
        prerelease: false,
        published_at: "2026-11-22T10:00:00Z",
      },
      local_tag: null,
    },
    {
      kind: "release",
      release: {
        id: "2",
        tag_name: "v1.0",
        name: null,
        notes: "Also hidden",
        html_url: "https://github.com/example/project/releases/tag/v1.0",
        prerelease: false,
        published_at: "2025-11-22T10:00:00Z",
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

beforeEach(() => {
  cleanup();
  mocks.releases = releaseList;
  mocks.isLoading = false;
  mocks.error = null;
  mocks.pendingAction = null;
  mocks.releaseView = null;
  mocks.openRelease.mockReset();
  mocks.refetchReleases.mockReset();
});
afterEach(cleanup);

describe("TagsReleasesPanel", () => {
  it("lists published releases compactly and marks the newest stable release", () => {
    renderWithQueryClient(<TagsReleasesPanel />);
    const list = screen.getByRole("list", { name: "Etiquetas y releases" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("Version 2")).toBeTruthy();
    expect(screen.getByText("v2.0")).toBeTruthy();
    expect(screen.getByText("Más reciente")).toBeTruthy();
    expect(screen.queryByText("Hidden in list")).toBeNull();
    expect(screen.queryByText("local-only")).toBeNull();
  });

  it("keeps cached and truncated scope visible beside the latest candidate", () => {
    mocks.releases = {
      ...releaseList,
      truncated: true,
      cached_at: "2026-11-23T10:00:00Z",
    };
    renderWithQueryClient(<TagsReleasesPanel />);

    expect(screen.getByText("Más reciente")).toBeTruthy();
    expect(
      screen
        .getAllByRole("status")
        .some((status) =>
          status.textContent.includes("datos guardados de releases"),
        ),
    ).toBe(true);
    expect(
      screen.getByText("Se muestran solo los primeros 1.000 releases."),
    ).toBeTruthy();
  });

  it("opens the selected release in the central view", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<TagsReleasesPanel />);
    await user.click(screen.getByRole("button", { name: /Version 2/ }));
    expect(mocks.openRelease).toHaveBeenCalledWith("1");
  });

  it("folds the release list while retaining its labeled section control", async () => {
    const user = userEvent.setup();
    const collapse = vi.fn();
    renderWithQueryClient(
      <TagsReleasesPanel collapsed={false} onCollapse={collapse} />,
    );
    await user.click(
      screen.getByRole("button", { name: "Etiquetas y releases" }),
    );
    expect(collapse).toHaveBeenCalledOnce();
  });

  it("shows loading, empty and typed offline states", () => {
    mocks.isLoading = true;
    mocks.releases = null;
    const { rerender } = renderWithQueryClient(<TagsReleasesPanel />);
    expect(screen.getByText("Cargando releases…").textContent).toBe(
      "Cargando releases…",
    );
    mocks.isLoading = false;
    mocks.releases = { ...releaseList, entries: [] };
    rerender(<TagsReleasesPanel />);
    expect(screen.getByRole("status").textContent).toBe(
      "No se encontraron releases publicados.",
    );
    cleanup();
    mocks.releases = null;
    mocks.error = Object.assign(new Error("offline"), { kind: "Offline" });
    renderWithQueryClient(<TagsReleasesPanel />);
    expect(screen.getByText("El dispositivo está sin conexión")).toBeTruthy();
  });
});
