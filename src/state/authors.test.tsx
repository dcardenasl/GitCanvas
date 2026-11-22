// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AppError,
  AuthorCatalogChunk,
  AuthorCatalogRequest,
  AuthorCommitIdsRequest,
  AuthorCommitIdsPage,
  AuthorKey,
} from "../bindings";
import { errorMessage } from "../lib/errors";
import { createQueryClientWrapper } from "../test/test-utils";
import {
  adjacentAuthorCommit,
  useAuthorCatalog,
  useAuthorCommitIds,
  useSelectedAuthor,
} from "./authors";

const mocks = vi.hoisted(() => ({
  getAuthorCatalogChunk:
    vi.fn<
      (
        root: string,
        request: AuthorCatalogRequest,
      ) => Promise<
        | { readonly status: "ok"; readonly data: AuthorCatalogChunk }
        | { readonly status: "error"; readonly error: AppError }
      >
    >(),
  getAuthorCommitIds:
    vi.fn<
      (
        root: string,
        request: AuthorCommitIdsRequest,
      ) => Promise<
        | { readonly status: "ok"; readonly data: AuthorCommitIdsPage }
        | { readonly status: "error"; readonly error: AppError }
      >
    >(),
}));

vi.mock("../bindings", () => ({
  commands: {
    getAuthorCatalogChunk: mocks.getAuthorCatalogChunk,
    getAuthorCommitIds: mocks.getAuthorCommitIds,
  },
}));

vi.mock("../lib/ipc", () => ({
  IpcError: class extends Error {
    readonly kind: AppError["kind"];

    constructor(error: AppError) {
      super(errorMessage(error));
      this.kind = error.kind;
    }
  },
}));

const AUTHOR: AuthorKey = { name: "Ada", email: "ada@example.com" };

function ok<T>(data: T) {
  return { status: "ok" as const, data };
}

function catalogChunk(
  authors: AuthorCatalogChunk["authors"],
  cursor: string | null,
  scanned: number,
  complete: boolean,
): AuthorCatalogChunk {
  return {
    authors,
    cursor,
    scanned,
    complete,
    incomplete_reason: null,
  };
}

function commitPage(
  commit_ids: string[],
  next_cursor: string | null,
): AuthorCommitIdsPage {
  return { commit_ids, next_cursor };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useSelectedAuthor", () => {
  it("keeps author selection isolated by repository root", () => {
    const first = renderHook(() => useSelectedAuthor("/repo/a"));
    const second = renderHook(() => useSelectedAuthor("/repo/b"));

    act(() => {
      first.result.current.select(AUTHOR);
    });

    expect(first.result.current.author).toEqual(AUTHOR);
    expect(second.result.current.author).toBeNull();
    act(() => {
      second.result.current.select({ ...AUTHOR, email: "other@example.com" });
    });
    expect(first.result.current.author).toEqual(AUTHOR);
    expect(second.result.current.author?.email).toBe("other@example.com");
  });
});

describe("useAuthorCatalog", () => {
  it("accumulates delta counts across pages for the same resolved identity", async () => {
    mocks.getAuthorCatalogChunk
      .mockResolvedValueOnce(
        ok(
          catalogChunk([{ author: AUTHOR, commits: 2 }], "cursor-1", 3, false),
        ),
      )
      .mockResolvedValueOnce(
        ok(catalogChunk([{ author: AUTHOR, commits: 4 }], null, 7, true)),
      );
    const { result } = renderHook(() => useAuthorCatalog("/repo"), {
      wrapper: createQueryClientWrapper(),
    });
    await waitFor(() => {
      expect(result.current.hasNextPage).toBe(true);
    });

    await act(async () => {
      await result.current.fetchNextPage();
    });

    await waitFor(() => {
      expect(result.current.authors[0]?.commits).toBe(6);
    });
    expect(result.current.authors).toEqual([{ author: AUTHOR, commits: 6 }]);
    expect(result.current.scanned).toBe(7);
    expect(result.current.complete).toBe(true);
  });

  it("restarts the catalog from its first chunk after a stale cursor", async () => {
    mocks.getAuthorCatalogChunk
      .mockResolvedValueOnce(
        ok(
          catalogChunk(
            [{ author: AUTHOR, commits: 1 }],
            "cursor-old",
            1,
            false,
          ),
        ),
      )
      .mockResolvedValueOnce({
        status: "error",
        error: { kind: "StaleCursor", message: "catalog changed" },
      })
      .mockResolvedValueOnce(
        ok(catalogChunk([{ author: AUTHOR, commits: 3 }], null, 3, true)),
      );
    const { result } = renderHook(() => useAuthorCatalog("/repo"), {
      wrapper: createQueryClientWrapper(),
    });
    await waitFor(() => {
      expect(result.current.hasNextPage).toBe(true);
    });

    await act(async () => {
      await result.current.fetchNextPage();
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    await waitFor(() => {
      expect(result.current.authors[0]?.commits).toBe(3);
    });
    expect(
      mocks.getAuthorCatalogChunk.mock.calls.map(([path, request]) => [
        path,
        request.cursor,
      ]),
    ).toEqual([
      ["/repo", null],
      ["/repo", "cursor-old"],
      ["/repo", null],
    ]);
  });
});

describe("adjacentAuthorCommit", () => {
  async function navigate(
    pages: readonly AuthorCommitIdsPage[],
    currentCommitId: string,
    direction: "previous" | "next",
  ): Promise<string | null> {
    mocks.getAuthorCommitIds.mockImplementation(
      (_root: string, request: AuthorCommitIdsRequest) => {
        const index = request.cursor === null ? 0 : Number(request.cursor);
        const page = pages[index];
        if (page === undefined)
          throw new Error("Unexpected author page request");
        return Promise.resolve(ok(page));
      },
    );
    const { result } = renderHook(() => useAuthorCommitIds("/repo", AUTHOR), {
      wrapper: createQueryClientWrapper(),
    });
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    let adjacent: string | null = null;
    await act(async () => {
      adjacent = await adjacentAuthorCommit(
        result.current,
        currentCommitId,
        direction,
      );
    });
    return adjacent;
  }

  it("finds the current commit in a later page and returns its neighbor", async () => {
    expect(
      await navigate(
        [commitPage(["a", "b"], "1"), commitPage(["c", "d"], null)],
        "c",
        "next",
      ),
    ).toBe("d");
  });

  it("returns the preceding commit when navigating backward from a later page", async () => {
    expect(
      await navigate(
        [commitPage(["a", "b"], "1"), commitPage(["c", "d"], null)],
        "c",
        "previous",
      ),
    ).toBe("b");
  });

  it("fetches the page containing a next commit that is not loaded", async () => {
    expect(
      await navigate(
        [commitPage(["a", "b"], "1"), commitPage(["c", "d"], null)],
        "b",
        "next",
      ),
    ).toBe("c");
  });

  it("returns null before the first and after the last author commit", async () => {
    expect(
      await navigate([commitPage(["a", "b"], null)], "a", "previous"),
    ).toBeNull();
    expect(
      await navigate([commitPage(["a", "b"], null)], "b", "next"),
    ).toBeNull();
  });

  it("returns null for an ID outside the author's history", async () => {
    expect(
      await navigate(
        [commitPage(["a", "b"], "1"), commitPage(["c"], null)],
        "unknown",
        "next",
      ),
    ).toBeNull();
  });
});
