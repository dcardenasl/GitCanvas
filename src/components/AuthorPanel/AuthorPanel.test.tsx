// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthorCount, AuthorKey } from "../../bindings";

const mocks = vi.hoisted(() => ({
  adjacentAuthorCommit: vi.fn(),
  fetchNextPage: vi.fn(),
  revealCommit: vi.fn(),
  selectAuthor: vi.fn(),
  selectedAuthor: null as AuthorKey | null,
  catalogComplete: true,
  catalogHasNextPage: false,
}));

vi.mock("../../state/authors", () => ({
  adjacentAuthorCommit: mocks.adjacentAuthorCommit,
  useAuthorCatalog: () => ({
    authors: [
      {
        author: { name: "Ada Lovelace", email: "ada@example.test" },
        commits: 7,
      },
      {
        author: { name: "Grace Hopper", email: "grace@example.test" },
        commits: 3,
      },
    ] satisfies AuthorCount[],
    scanned: 20,
    complete: mocks.catalogComplete,
    incompleteReason: null,
    isFetching: false,
    isFetchingNextPage: false,
    hasNextPage: mocks.catalogHasNextPage,
    fetchNextPage: mocks.fetchNextPage,
    isError: false,
  }),
  useAuthorCommitIds: () => ({ commitIds: ["current"], hasNextPage: false }),
  useSelectedAuthor: () => ({
    author: mocks.selectedAuthor,
    select: mocks.selectAuthor,
  }),
}));

vi.mock("../../state/workspace", () => ({
  useActiveRepository: () => ({ path: "/repo", name: "repo" }),
  useNavigation: (select: (navigation: unknown) => unknown) =>
    select({ selection: { kind: "commit", commitId: "current" } }),
  useNavigationActions: () => ({ revealCommit: mocks.revealCommit }),
}));

import { AuthorPanel } from "./AuthorPanel";

const AUTHOR: AuthorKey = {
  name: "Ada Lovelace",
  email: "ada@example.test",
};

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.selectedAuthor = null;
  mocks.catalogComplete = true;
  mocks.catalogHasNextPage = false;
  mocks.fetchNextPage.mockReset();
  mocks.adjacentAuthorCommit.mockResolvedValue("next");
  mocks.selectAuthor.mockImplementation((author: AuthorKey | null) => {
    mocks.selectedAuthor = author;
  });
});

describe("AuthorPanel", () => {
  it("searches authors by display name and email and selects the resolved identity", async () => {
    const user = userEvent.setup();
    render(<AuthorPanel />);

    expect(
      screen.getByText("Catálogo completo: 20 commits revisados"),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: /Ada Lovelace/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Grace Hopper/ })).toBeTruthy();
    await user.type(
      screen.getByRole("searchbox", { name: "Buscar autores" }),
      "grace@",
    );

    expect(screen.queryByRole("button", { name: /Ada Lovelace/ })).toBeNull();
    const grace = screen.getByRole("button", { name: /Grace Hopper/ });
    await user.click(grace);
    expect(mocks.selectAuthor).toHaveBeenCalledWith({
      name: "Grace Hopper",
      email: "grace@example.test",
    });
  });

  it("navigates to the next author commit from the keyboard accessible control", async () => {
    mocks.selectedAuthor = AUTHOR;
    render(<AuthorPanel />);
    const next = screen.getByRole("button", { name: "Siguiente" });
    fireEvent.keyDown(next, { key: "ArrowRight", altKey: true });

    await screen.findByRole("status", { name: "Navegación de autores" });
    await waitFor(() => {
      expect(mocks.adjacentAuthorCommit).toHaveBeenCalledWith(
        expect.objectContaining({ commitIds: ["current"] }),
        "current",
        "next",
      );
    });
    await waitFor(() => {
      expect(mocks.revealCommit).toHaveBeenCalledWith("next");
    });
  });

  it("pauses and resumes catalog scanning between chunks", async () => {
    const user = userEvent.setup();
    mocks.catalogComplete = false;
    mocks.catalogHasNextPage = true;
    render(<AuthorPanel />);
    await waitFor(() => {
      expect(mocks.fetchNextPage).toHaveBeenCalledTimes(1);
    });

    await user.click(screen.getByRole("button", { name: "Pausar análisis" }));
    expect(
      screen.getByText("Catálogo pausado después de 20 commits."),
    ).toBeTruthy();
    expect(mocks.fetchNextPage).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Seguir analizando" }));
    await waitFor(() => {
      expect(mocks.fetchNextPage).toHaveBeenCalledTimes(2);
    });
  });
});
