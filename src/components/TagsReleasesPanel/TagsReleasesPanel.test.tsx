// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReleaseListIpc } from "../../bindings";

const mocks = vi.hoisted(() => ({
  repositoryPath: "/repo",
  releases: null as ReleaseListIpc | null,
  isLoading: false,
  error: null as Error | null,
}));

vi.mock("../../state/workspace", () => ({
  useActiveRepository: () => ({ path: mocks.repositoryPath, name: "repo" }),
}));

vi.mock("../../state/releases", () => ({
  useReleases: () => ({
    data: mocks.releases,
    isLoading: mocks.isLoading,
    isError: mocks.error !== null,
    error: mocks.error,
  }),
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

beforeEach(() => {
  cleanup();
  mocks.repositoryPath = "/repo";
  mocks.releases = releaseList;
  mocks.isLoading = false;
  mocks.error = null;
});

afterEach(cleanup);

describe("TagsReleasesPanel", () => {
  it("shows backend-joined releases and unmatched local tags in one list", () => {
    render(<TagsReleasesPanel />);

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
    render(<TagsReleasesPanel />);

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
    render(<TagsReleasesPanel />);

    expect(
      screen.getByText(
        "No se pudieron leer las etiquetas locales; se muestran los releases.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Version 2")).toBeTruthy();
    expect(screen.getAllByText("Estado local no disponible")).toHaveLength(2);
  });

  it("labels cached release data with its capture time", () => {
    mocks.releases = { ...releaseList, cached_at: "2026-11-22T10:00:00Z" };
    render(<TagsReleasesPanel />);

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
    const { rerender } = render(<TagsReleasesPanel />);
    expect(screen.getByRole("status").textContent).toBe("Cargando releases…");

    mocks.isLoading = false;
    mocks.releases = { ...releaseList, entries: [] };
    rerender(<TagsReleasesPanel />);
    expect(screen.getByRole("status").textContent).toBe(
      "No se encontraron etiquetas ni releases.",
    );
  });
});
