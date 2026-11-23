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
  it("can fold its content behind the shared sidebar section control", async () => {
    const user = userEvent.setup();
    const onCollapse = vi.fn();
    mocks.selectedAuthor = AUTHOR;
    render(<AuthorPanel collapsed={false} onCollapse={onCollapse} />);
    const toggle = screen.getByRole("button", { name: "Autores" });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    await user.click(toggle);
    expect(onCollapse).toHaveBeenCalledOnce();
    expect(mocks.selectedAuthor).toEqual(AUTHOR);
  });

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

  it("uses Alt+Left to reveal the previous commit for the selected author", async () => {
    mocks.selectedAuthor = AUTHOR;
    mocks.adjacentAuthorCommit.mockResolvedValue("previous");
    render(<AuthorPanel />);
    const previous = screen.getByRole("button", { name: "Anterior" });
    previous.focus();
    fireEvent.keyDown(previous, { key: "ArrowLeft", altKey: true });

    await waitFor(() => {
      expect(mocks.adjacentAuthorCommit).toHaveBeenCalledWith(
        expect.objectContaining({ commitIds: ["current"] }),
        "current",
        "previous",
      );
      expect(mocks.revealCommit).toHaveBeenCalledWith("previous");
    });
  });

  it("does not intercept Alt+Left or Alt+Right while the author search has focus", () => {
    mocks.selectedAuthor = AUTHOR;
    render(<AuthorPanel />);
    const search = screen.getByRole("searchbox", { name: "Buscar autores" });
    search.focus();

    for (const key of ["ArrowLeft", "ArrowRight"] as const) {
      const event = new KeyboardEvent("keydown", {
        key,
        altKey: true,
        bubbles: true,
        cancelable: true,
      });
      search.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
    expect(mocks.adjacentAuthorCommit).not.toHaveBeenCalled();
    expect(mocks.revealCommit).not.toHaveBeenCalled();
  });

  it("exposes labelled controls and a complete keyboard tab sequence", async () => {
    const user = userEvent.setup();
    mocks.catalogComplete = false;
    mocks.catalogHasNextPage = true;
    mocks.selectedAuthor = AUTHOR;
    render(<AuthorPanel />);

    const search = screen.getByRole("searchbox", { name: "Buscar autores" });
    const ada = screen.getByRole("button", {
      name: /Ada Lovelace.*ada@example.test/,
    });
    const grace = screen.getByRole("button", {
      name: /Grace Hopper.*grace@example.test/,
    });
    const pause = screen.getByRole("button", { name: "Pausar análisis" });
    const previous = screen.getByRole("button", { name: "Anterior" });
    const next = screen.getByRole("button", { name: "Siguiente" });
    const progress = screen.getByText(
      "Leyendo catálogo de autores: 20 commits leídos",
    );

    expect(progress.getAttribute("aria-live")).toBe("polite");
    expect(progress.getAttribute("role")).toBe("status");
    expect(ada.getAttribute("aria-pressed")).toBe("true");
    expect(grace.getAttribute("aria-pressed")).toBe("false");
    expect(previous.getAttribute("aria-keyshortcuts")).toBe("Alt+ArrowLeft");
    expect(next.getAttribute("aria-keyshortcuts")).toBe("Alt+ArrowRight");

    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Autores" }),
    );
    await user.tab();
    expect(document.activeElement).toBe(search);
    await user.tab();
    expect(document.activeElement).toBe(pause);
    await user.keyboard("{Enter}");
    const resume = screen.getByRole("button", { name: "Seguir analizando" });
    expect(document.activeElement).toBe(resume);
    await user.tab();
    expect(document.activeElement).toBe(ada);
    await user.tab();
    expect(document.activeElement).toBe(grace);
    await user.tab();
    expect(document.activeElement).toBe(previous);
    await user.tab();
    expect(document.activeElement).toBe(next);
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
